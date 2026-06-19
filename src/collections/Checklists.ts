import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'

// Función helper para extraer IDs de miembros de forma segura (soporta string, objeto o array)
const obtenerIdsMiembros = (membersData: any): string[] => {
  if (!membersData) return [];
  if (Array.isArray(membersData)) {
    return membersData.map((m) => (typeof m === 'object' ? m.id || m._id : m)).filter(Boolean);
  }
  if (typeof membersData === 'object') {
    return [membersData.id || membersData._id].filter(Boolean);
  }
  return [membersData];
};

const checklistsAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  try {
    if (operation === 'update') {
      const idsActuales = obtenerIdsMiembros(doc.membersID);
      const idsAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

      // Si cambió la lista de IDs asignados (se agregó uno nuevo o cambió el responsable)
      const cambioColaborador = idsActuales.some((id) => !idsAnteriores.includes(id)) || idsActuales.length !== idsAnteriores.length;

      if (cambioColaborador && idsActuales.length > 0) {
        // Encontrar la tarea padre que contiene esta subtarea
        const parentTasks = await req.payload.find({
          collection: 'tasks',
          where: {
            checkListsID: {
              equals: doc.id,
            },
          },
          depth: 1,
          req,
        });

        if (parentTasks.docs && parentTasks.docs.length > 0) {
          const parentTask = parentTasks.docs[0];

          // Realizamos la consulta con depth: 3 para inflar por completo los objetos de los usuarios asignados
          const populatedChecklist = await req.payload.findByID({
            collection: 'checklists',
            id: doc.id,
            depth: 3,
            req,
          });

          const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';

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
                membersID: populatedChecklist.membersID || [] // Array de objetos de usuarios populados
              },
              parentTask: {
                id: parentTask.id,
                name: parentTask.name
              }
            }),
          });
        }
      }
    }
  } catch (error) {
    console.error('Error crítico en el filtrado del hook afterChange de Checklists:', error);
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
