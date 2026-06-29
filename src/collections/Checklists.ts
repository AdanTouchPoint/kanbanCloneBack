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
    // NOTIFICACIÓN DE LA SUBTAREA (CHECKLIST)
    // ==========================================
    const debeNotificar = (idsActuales: string[], idsAnteriores: string[]) => {
      if (idsActuales.length === 0) return false;
      if (idsAnteriores.length === 0) return true; // Creación con miembros
      return idsActuales.some(id => !idsAnteriores.includes(id)); // Nuevos miembros añadidos
    };

    const idsActuales = obtenerIdsMiembros(doc?.membersID);
    const idsAnteriores = obtenerIdsMiembros(previousDoc?.membersID);

    if (debeNotificar(idsActuales, idsAnteriores)) {
      const populatedChecklist = await req.payload.findByID({
        collection: 'checklists',
        id: doc.id,
        depth: 2,
        req,
      });

      const miembros = Array.isArray(populatedChecklist.membersID)
        ? populatedChecklist.membersID
        : populatedChecklist.membersID
        ? [populatedChecklist.membersID]
        : [];

      await fetch(urlWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'colaborador_assigned',
          tipo: 'subtarea',
          subtask: {
            id: populatedChecklist.id,
            name: populatedChecklist.name,
            due: populatedChecklist.due,
            state: populatedChecklist.state,
            membersID: miembros,
          },
        }),
      });
    }
  } catch (error) {
    console.error('Error crítico en hook afterChange de Checklists:', error);
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
