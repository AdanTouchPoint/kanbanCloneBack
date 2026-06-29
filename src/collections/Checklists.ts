import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'
// Función auxiliar para normalizar y extraer IDs de miembros
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

const checklistsAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return;

  try {
    const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';

    // ==========================================
    // 1. NOTIFICACIÓN DE LA TAREA PADRE
    // ==========================================
    const debeNotificar = (idsActuales: string[], idsAnteriores: string[]) => {
      if (idsActuales.length === 0) return false;
      if (idsAnteriores.length === 0) return true; // Creación con miembros
      return idsActuales.some(id => !idsAnteriores.includes(id)); // Nuevos miembros añadidos
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
          evento: 'colaborador_assigned',
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

    // ==========================================
    // 2. NOTIFICACIÓN DE LAS SUBTAREAS (CHECKLISTS)
    // ==========================================
    // Consultamos la base de datos para obtener el estado real y más fresco de la tarea
    const freshDoc = await req.payload.findByID({
      collection: 'tasks',
      id: doc.id,
      depth: 0,
      req,
    });

    const checklistsActuales = (freshDoc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);

    const checklistsAnteriores = (previousDoc?.checkListsID || []).map((c: any) =>
      typeof c === 'object' && c !== null ? c.id || c._id : String(c)
    ).filter(Boolean);

    // Identificamos las subtareas que realmente se acaban de añadir
    const checklistsAnadidos = checklistsActuales.filter((id: string) => !checklistsAnteriores.includes(id));

    if (checklistsAnadidos.length > 0) {
      // Mapeamos cada subtarea añadida a una promesa de ejecución en paralelo
      const promesasNotificaciones = checklistsAnadidos.map(async (subId) => {
        try {
          const populatedChecklist = await req.payload.findByID({
            collection: 'checklists',
            id: subId,
            depth: 3,
            req,
          });

          const miembrosRaw = populatedChecklist.membersID || [];
          const miembros = Array.isArray(miembrosRaw) ? miembrosRaw : [miembrosRaw];

          // Enviamos las peticiones HTTP de los miembros asignados en esta subtarea
          const enviosMiembros = miembros.map(async (miembro) => {
            if (miembro && typeof miembro === 'object') {
              const uId = (miembro as any).id || (miembro as any)._id;
              if (uId) {
                return fetch(urlWebhook, {
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
          });

          // Esperamos a todos los destinatarios de esta subtarea específica
          await Promise.all(enviosMiembros);

        } catch (subErr) {
          console.error(`Error al procesar/notificar subtarea ${subId}:`, subErr);
        }
      });

      // Forzamos a Payload a esperar a que TODOS los webhooks hayan salido hacia n8n
      await Promise.all(promesasNotificaciones);
    }

  } catch (error) {
    console.error('Error crítico en hook afterChange de Tasks:', error);
  }
};

export const Checklists: CollectionConfig = {
  slug: 'checklists',
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
      name: 'state',
      type: 'text',
    },
    {
      name: 'membersID',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
  ],
  hooks: {
    afterChange: [checklistsAfterChangeHook]
  }
}
