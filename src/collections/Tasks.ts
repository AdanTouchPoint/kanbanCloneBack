import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'

// Helper para extraer IDs de miembros siempre como array de strings
const obtenerIdsMiembros = (membersData: any): string[] => {
  if (!membersData) return [];

  // Si es array
  if (Array.isArray(membersData)) {
    return membersData
      .map((m: any) => (typeof m === 'object' && m !== null ? m.id || m._id : String(m)))
      .filter(Boolean);
  }

  // Si es objeto (relación singular)
  if (typeof membersData === 'object' && membersData !== null) {
    const id = membersData.id || membersData._id;
    return id ? [String(id)] : [];
  }

  // Si es string o número
  return [String(membersData)];
};

const tasksAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return;

  try {
    // Función que decide si se debe notificar un cambio en los miembros:
    // Se notifica si hay al menos un miembro nuevo (no presente antes) Y el array resultante no está vacío.
    const debeNotificar = (idsActuales: string[], idsAnteriores: string[]) => {
      if (idsActuales.length === 0) return false;
      // Si no hay anteriores (creación) y hay miembros -> sí
      if (idsAnteriores.length === 0) return true;
      // Si hay al menos un ID nuevo que no estaba antes -> sí
      return idsActuales.some(id => !idsAnteriores.includes(id));
    };

    const idsPadreActuales = obtenerIdsMiembros(doc?.membersID);
    const idsPadreAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

    if (debeNotificar(idsPadreActuales, idsPadreAnteriores)) {
      // Obtenemos la tarea populada
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 2, // suficiente para inflar los objetos de miembros
        req,
      });

      const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';

      // Asegurar membersID como array
      const miembros = Array.isArray(populatedTask.membersID)
        ? populatedTask.membersID
        : populatedTask.membersID
        ? [populatedTask.membersID]
        : [];

      await fetch(urlWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'colaborador_asignado',
          tipo: 'tarea',
          task: {
            id: populatedTask.id,
            name: populatedTask.name,
            due: populatedTask.due,
            membersID: miembros,
          },
        }),
      });
    }

    // Identificar checklists añadidos a la tarea y enviar notificación agrupada por colaborador
    const checklistsActuales = (doc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);
    const checklistsAnteriores = (previousDoc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);
    const checklistsAnadidos = checklistsActuales.filter((id: string) => !checklistsAnteriores.includes(id));

    if (checklistsAnadidos.length > 0) {
      const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';
      const subtareasPorUsuario: { [userId: string]: { user: any; subtasks: any[] } } = {};

      for (const subId of checklistsAnadidos) {
        try {
          const populatedChecklist = await req.payload.findByID({
            collection: 'checklists',
            id: subId,
            depth: 3,
            req,
          });

          const miembrosRaw = populatedChecklist.membersID || [];
          const miembros = Array.isArray(miembrosRaw) ? miembrosRaw : [miembrosRaw];

          for (const miembro of miembros) {
            if (miembro && typeof miembro === 'object') {
              const uId = (miembro as any).id || (miembro as any)._id;
              if (uId) {
                const uIdStr = String(uId);
                if (!subtareasPorUsuario[uIdStr]) {
                  subtareasPorUsuario[uIdStr] = {
                    user: miembro,
                    subtasks: []
                  };
                }
                subtareasPorUsuario[uIdStr].subtasks.push({
                  id: populatedChecklist.id,
                  name: populatedChecklist.name,
                  due: populatedChecklist.due || 'unknown',
                  state: populatedChecklist.state || 'unknown',
                });
              }
            }
          }
        } catch (subErr) {
          console.error(`Error al procesar/agrupar subtarea ${subId}:`, subErr);
        }
      }

      // Enviar una notificación por cada usuario con todas sus subtareas asignadas
      for (const userId of Object.keys(subtareasPorUsuario)) {
        const { user, subtasks } = subtareasPorUsuario[userId];
        if (subtasks.length > 0) {
          try {
            const payload: any = {
              evento: 'colaborador_asignado',
              tipo: 'subtarea',
              subtasks: subtasks.map(s => ({
                id: s.id,
                name: s.name,
                due: s.due,
                state: s.state,
                membersID: [user]
              })),
              parentTask: {
                id: doc.id,
                name: doc.name
              }
            };

            // Compatibilidad hacia atrás si solo hay una subtarea
            if (subtasks.length === 1) {
              payload.subtask = {
                id: subtasks[0].id,
                name: subtasks[0].name,
                due: subtasks[0].due,
                state: subtasks[0].state,
                membersID: [user]
              };
            }

            await fetch(urlWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } catch (sendErr) {
            console.error(`Error al enviar webhook de subtareas para usuario ${userId}:`, sendErr);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en hook afterChange de Tasks:', error);
  }
};
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'autorID',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'state',
      type: 'text',
    },
    {
      name: 'due',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'yyyy-MM-dd',
        },
      },
    },
    {
      name: 'checkListsID',
      type: 'relationship',
      relationTo: 'checklists',
      hasMany: true,
    },
    {
      name: 'columnsID',
      type: 'relationship',
      relationTo: 'columns',
      required: true,
    },
    {
      name: 'membersID',
      type: 'relationship',
      relationTo: 'users',
    }
  ],
  hooks: {
    afterChange: [tasksAfterChangeHook]
  }
}
