import type { CollectionConfig,CollectionAfterChangeHook } from 'payload'
// 1. Definir una interfaz local para indicarle a TypeScript qué estructura tienen tus subtareas
interface SubtareaObjeto {
  id: string;
  name?: string;
  due?: string;
  state?: string;
  membersID?: any;
}

const tasksAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  try {
    // Aseguramos que trate las listas como arrays de objetos o strings
    const prevSubs = (previousDoc?.checkListsID || []) as Array<string | SubtareaObjeto>;
    const currentSubs = (doc?.checkListsID || []) as Array<string | SubtareaObjeto>;

    let subTaskAfectada: SubtareaObjeto | null = null;
    let tipoEvento: 'tarea' | 'subtarea' = 'tarea';

    if (operation === 'update') {
      // Caso A: Se añadió una nueva subtarea al array
      if (currentSubs.length > prevSubs.length) {
        subTaskAfectada = currentSubs.find((sub) => {
          // Type Guard: Si 'sub' es un string o no tiene id, lo ignoramos
          if (!sub || typeof sub === 'string') return false;
          
          return !prevSubs.some((p) => {
            if (!p || typeof p === 'string') return false;
            return p.id === sub.id;
          });
        }) as SubtareaObjeto | undefined || null;

        if (subTaskAfectada) tipoEvento = 'subtarea';
      } 
      // Caso B: El número de subtareas es igual, pero una cambió de estado o de asignado
      else {
        subTaskAfectada = currentSubs.find((sub) => {
          if (!sub || typeof sub === 'string') return false;

          const prevSub = prevSubs.find((p) => {
            if (!p || typeof p === 'string') return false;
            return p.id === sub.id;
          }) as SubtareaObjeto | undefined;

          if (!prevSub) return false;
          
          const miembroCambio = JSON.stringify(sub.membersID) !== JSON.stringify(prevSub.membersID);
          const estadoCambio = sub.state !== prevSub.state;
          
          return miembroCambio || estadoCambio;
        }) as SubtareaObjeto | undefined || null;
        
        if (subTaskAfectada) {
          tipoEvento = 'subtarea';
        }
      }
    } else if (operation === 'create') {
      if (currentSubs.length > 0 && typeof currentSubs[0] !== 'string') {
        subTaskAfectada = currentSubs[0] as SubtareaObjeto;
        tipoEvento = 'subtarea';
      }
    }

    // 2. Si el cambio ocurrió en una Subtarea
    if (tipoEvento === 'subtarea' && subTaskAfectada && subTaskAfectada.id) {
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 3,
        req,
      });

      const populatedSub = populatedTask.checkListsID?.find((s: any) => s && (typeof s !== 'string') && s.id === subTaskAfectada?.id) as any;

      if (populatedSub) {
        await fetch('https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evento: 'colaborador_asignado',
            tipo: 'subtarea',
            subtask: {
              id: populatedSub.id || 'unknown',
              name: populatedSub.name || 'unknown',
              due: populatedSub.due ||  'unknown',
              state: populatedSub.state || 'unknown',
              membersID: populatedSub.membersID || 'unknown' 
            },
            parentTask: {
              id: doc.id,
              name: doc.name
            }
          }),
        });
      }
      return;
    }

    // 3. Si no fue cambio de subtarea, evaluar si cambió el asignado de la TAREA PADRE
    const prevTaskMembers = previousDoc?.membersID || [];
    const currentTaskMembers = doc?.membersID || [];
    const taskMemberChanged = JSON.stringify(currentTaskMembers) !== JSON.stringify(prevTaskMembers);

    if ((operation === 'create' || taskMemberChanged) && tipoEvento === 'tarea') {
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 3,
        req,
      });

      await fetch('https://tu-instancia-n8n.com/webhook/id-de-tu-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'colaborador_asignado',
          tipo: 'tarea',
          task: {
            id: populatedTask.id,
            name: populatedTask.name,
            due: populatedTask.due,
            membersID: populatedTask.membersID 
          }
        }),
      });
    }

  } catch (error) {
    console.error('Error en el filtrado del hook afterChange:', error);
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
  }
}
