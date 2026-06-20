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

const boardsAfterChangeHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, operation }) => {
  try {
    const idsActuales = obtenerIdsMiembros(doc.membersID);
    let idsAgregados: string[] = [];

    if (operation === 'create') {
      idsAgregados = idsActuales;
    } else if (operation === 'update') {
      const idsAnteriores = obtenerIdsMiembros(previousDoc?.membersID);
      idsAgregados = idsActuales.filter((id) => !idsAnteriores.includes(id));
    }

    if (idsAgregados.length > 0) {
      const urlWebhook = 'https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916';

      for (const userId of idsAgregados) {
        try {
          const userDoc = await req.payload.findByID({
            collection: 'users',
            id: userId,
            depth: 1,
            req,
          });

          if (userDoc) {
            await fetch(urlWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                evento: 'miembro_agregado_tablero',
                board: {
                  id: doc.id,
                  name: doc.name,
                },
                user: {
                  id: userDoc.id,
                  name: userDoc.name || 'unknown',
                  email: userDoc.email || 'unknown',
                },
              }),
            });
          }
        } catch (err) {
          console.error(`Error al enviar notificación de miembro agregado (User ID: ${userId}):`, err);
        }
      }
    }
  } catch (error) {
    console.error('Error crítico en el filtrado del hook afterChange de Boards:', error);
  }
};

export const Boards: CollectionConfig = {
  slug: 'boards',
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
      name: 'membersID',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
    {
      name: 'tasksID',
      type: 'relationship',
      relationTo: 'tasks',
      hasMany: true,
    },
    {
      name: 'columnsID',
      type: 'relationship',
      relationTo: 'columns',
      hasMany: true,
    },
  ],
  hooks: {
    afterChange: [boardsAfterChangeHook],
  },
}
