import type { CollectionConfig,CollectionAfterChangeHook } from 'payload'
// 1. Definir una interfaz local para indicarle a TypeScript qué estructura tienen tus subtareas
interface SubtareaObjeto {
  id: string;
  name?: string;
  due?: string;
  state?: string;
  membersID?: any;
}
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

const tasksAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  try {
    const prevSubs = (previousDoc?.checkListsID || []) as Array<string | SubtareaObjeto>;
    const currentSubs = (doc?.checkListsID || []) as Array<string | SubtareaObjeto>;

    let subTaskAfectada: any = null;
    let tipoEvento: 'tarea' | 'subtarea' = 'tarea';
    let dispararWebhook = false;

    // --- CASO A: OPERACIÓN CREAR (CREATE) ---
    if (operation === 'create') {
      // 1. Se creó una tarea con subtareas que ya tienen miembros
      const tieneSubtareaConMiembro = currentSubs.find(
        (s) => s && typeof s !== 'string' && obtenerIdsMiembros(s.membersID).length > 0
      );

      if (tieneSubtareaConMiembro) {
        subTaskAfectada = tieneSubtareaConMiembro;
        tipoEvento = 'subtarea';
        dispararWebhook = true;
      } 
      // 2. Se creó una tarea padre con miembros asignados
      else if (obtenerIdsMiembros(doc?.membersID).length > 0) {
        tipoEvento = 'tarea';
        dispararWebhook = true;
      }
    }

    // --- CASO B: OPERACIÓN ACTUALIZAR (UPDATE) ---
    if (operation === 'update') {
      // 3. Evaluar si se AGREGÓ una nueva subtarea
      if (currentSubs.length > prevSubs.length) {
        const nuevaSub = currentSubs.find(
          (sub) => !prevSubs.some((p) => p && typeof p !== 'string' && typeof sub !== 'string' && p.id === sub.id)
        );
        // Solo nos interesa si la nueva subtarea tiene un colaborador asignado
        if (nuevaSub && typeof nuevaSub !== 'string' && obtenerIdsMiembros(nuevaSub.membersID).length > 0) {
          subTaskAfectada = nuevaSub;
          tipoEvento = 'subtarea';
          dispararWebhook = true;
        }
      } 
      // 4. Evaluar si se ACTUALIZARON los colaboradores de una subtarea existente
      else {
        const subConCambioDeMiembro = currentSubs.find((sub) => {
          if (!sub || typeof sub === 'string') return false;

          const prevSub = prevSubs.find(
            (p) => p && typeof p !== 'string' && p.id === sub.id
          ) as SubtareaObjeto | undefined;

          if (!prevSub) return false;

          const idsActuales = obtenerIdsMiembros(sub.membersID);
          const idsAnteriores = obtenerIdsMiembros(prevSub.membersID);

          // Si cambió la lista de IDs asignados (se agregó uno nuevo o cambió el responsable)
          const cambioColaborador = idsActuales.some((id) => !idsAnteriores.includes(id)) || idsActuales.length !== idsAnteriores.length;
          return cambioColaborador && idsActuales.length > 0;
        });

        if (subConCambioDeMiembro) {
          subTaskAfectada = subConCambioDeMiembro;
          tipoEvento = 'subtarea';
          dispararWebhook = true;
        }
      }

      // 5. Si no fue evento de subtarea, evaluar si cambió el colaborador de la TAREA PADRE
      if (!dispararWebhook) {
        const idsPadreActuales = obtenerIdsMiembros(doc?.membersID);
        const idsPadreAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

        const padreCambioColaborador = idsPadreActuales.some((id) => !idsPadreAnteriores.includes(id)) || idsPadreActuales.length !== idsPadreAnteriores.length;

        if (padreCambioColaborador && idsPadreActuales.length > 0) {
          tipoEvento = 'tarea';
          dispararWebhook = true;
        }
      }
    }

    // --- EJECUCIÓN DEL WEBHOOK (SI CORRESPONDE) ---
    if (dispararWebhook) {
      // Realizamos la consulta con depth: 3 para inflar por completo los objetos de los usuarios asignados
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 3,
        req,
      });

      const urlWebhook = 'https://tu-instancia-n8n.com/webhook/id-de-tu-trigger';

      if (tipoEvento === 'subtarea' && subTaskAfectada) {
        const populatedSub = populatedTask.checkListsID?.find(
          (s: any) => s && typeof s !== 'string' && s.id === subTaskAfectada.id
        ) as any;

        if (populatedSub) {
          await fetch(urlWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              evento: 'colaborador_asignado',
              tipo: 'subtarea',
              subtask: {
                id: populatedSub.id || 'unknown',
                name: populatedSub.name || 'unknown',
                due: populatedSub.due || 'unknown',
                state: populatedSub.state || 'unknown',
                membersID: populatedSub.membersID || [] // Array de objetos de usuarios populados
              },
              parentTask: {
                id: doc.id,
                name: doc.name
              }
            }),
          });
        }
      } else if (tipoEvento === 'tarea') {
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
              membersID: populatedTask.membersID || [] // Array u objeto de usuario populado
            }
          }),
        });
      }
    }

  } catch (error) {
    console.error('Error crítico en el filtrado del hook afterChange de Tasks:', error);
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
