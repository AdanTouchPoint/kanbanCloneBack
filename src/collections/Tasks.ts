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
  try {
    // Normalizamos subtareas para trabajar solo con objetos (descartamos strings)
    const prevSubs = (previousDoc?.checkListsID || [])
      .filter((s: any) => typeof s === 'object' && s !== null);
    const currentSubs = (doc?.checkListsID || [])
      .filter((s: any) => typeof s === 'object' && s !== null);

    // Mapa de IDs previos de subtareas para detectar nuevas
    const prevSubIds = new Set(prevSubs.map((s: any) => s.id));

    // Función que decide si se debe notificar un cambio en los miembros:
    // Se notifica si hay al menos un miembro nuevo (no presente antes) Y el array resultante no está vacío.
    const debeNotificar = (idsActuales: string[], idsAnteriores: string[]) => {
      if (idsActuales.length === 0) return false;
      // Si no hay anteriores (creación) y hay miembros -> sí
      if (idsAnteriores.length === 0) return true;
      // Si hay al menos un ID nuevo que no estaba antes -> sí
      return idsActuales.some(id => !idsAnteriores.includes(id));
    };

    const notificaciones: Array<{
      tipo: 'tarea' | 'subtarea';
      subtask?: any;    // solo para subtareas
    }> = [];

    // --- CASO TAREA PADRE ---
    const idsPadreActuales = obtenerIdsMiembros(doc?.membersID);
    const idsPadreAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

    if (debeNotificar(idsPadreActuales, idsPadreAnteriores)) {
      notificaciones.push({ tipo: 'tarea' });
    }

    // --- CASO SUBTAREAS ---
    for (const sub of currentSubs) {
      const prevSub = prevSubs.find((p: any) => p.id === sub.id);
      const idsActuales = obtenerIdsMiembros(sub.membersID);
      const idsAnteriores = prevSub ? obtenerIdsMiembros(prevSub.membersID) : [];

      // Es una subtarea nueva (no existía antes) o una existente con cambio en miembros
      if (!prevSub || debeNotificar(idsActuales, idsAnteriores)) {
        if (idsActuales.length > 0) {
          notificaciones.push({
            tipo: 'subtarea',
            subtask: sub, // solo necesitamos el ID y los datos básicos, luego poblaremos
          });
        }
      }
    }

    // --- DISPARAR WEBHOOKS ---
    if (notificaciones.length > 0) {
      // Obtenemos la tarea populada una sola vez
      const populatedTask = await req.payload.findByID({
        collection: 'tasks',
        id: doc.id,
        depth: 3, // para inflar los objetos de miembros y subtareas
        req,
      });

      const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook-test/62ad72ab-865f-4893-80fa-1c55d686d916';

      for (const notif of notificaciones) {
        if (notif.tipo === 'tarea') {
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
        } else {
          // Subtarea: buscamos su versión populada en la tarea populada
          const populatedSub = populatedTask.checkListsID?.find(
            (s: any) => typeof s === 'object' && s.id === notif.subtask.id
          ) as any;

          if (populatedSub) {
            const miembros = Array.isArray(populatedSub.membersID)
              ? populatedSub.membersID
              : populatedSub.membersID
              ? [populatedSub.membersID]
              : [];

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
                  membersID: miembros,
                },
                parentTask: {
                  id: doc.id,
                  name: doc.name,
                },
              }),
            });
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
