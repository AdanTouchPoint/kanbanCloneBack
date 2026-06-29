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
    const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';

    // --- SECCIÓN 1: NOTIFICACIÓN DE LA TAREA PADRE ---
    const debeNotificar = (idsActuales: string[], idsAnteriores: string[]) => {
      if (idsActuales.length === 0) return false;
      if (idsAnteriores.length === 0) return true;
      return idsActuales.some(id => !idsAnteriores.includes(id));
    };

    const idsPadreActuales = obtenerIdsMiembros(doc?.membersID);
    const idsPadreAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

    if (debeNotificar(idsPadreActuales, idsPadreAnteriores)) {
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 2,
        req,
      });

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

    // --- SECCIÓN 2: CORRECCIÓN PARA LAS SUBTAREAS (CHECKLISTS) ---
    // En lugar de confiar en 'doc', traemos la versión fresca y final de la base de datos
    const freshDoc = await req.payload.findByID({
      collection: 'tasks',
      id: doc.id,
      depth: 0, // No necesitamos popular aquí, solo los IDs limpios
      req,
    });

    const checklistsActuales = (freshDoc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);

    const checklistsAnteriores = (previousDoc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);

    const checklistsAnadidos = checklistsActuales.filter((id: string) => !checklistsAnteriores.includes(id));

    if (checklistsAnadidos.length > 0) {
      // PROCESAMOS TODAS LAS SUBTAREAS DETECTADAS
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
                // Ejecutamos el fetch y esperamos su resolución antes de avanzar a la siguiente subtarea
                await fetch(urlWebhook, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    evento: 'colaborador_asignado',
                    tipo: 'subtarea',
                    subtask: {
                      id: populatedChecklist.id,
                      name: populatedChecklist.name,
                      due: populatedChecklist.due || 'unknown',
                      state: populatedChecklist.state || 'unknown',
                      membersID: [miembro]
                    },
                    parentTask: {
                      id: doc.id,
                      name: doc.name
                    }
                  }),
                });
              }
            }
          }
        } catch (subErr) {
          console.error(`Error al procesar/notificar subtarea ${subId}:`, subErr);
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
