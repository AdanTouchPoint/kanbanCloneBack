import type { CollectionConfig } from 'payload'

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
    afterChange: [
      async ({ doc, previousDoc, operation }) => {
        // 1. Verificar si es una nueva asignación o si el colaborador cambió
        const prevMembers = previousDoc?.membersID || [];
        const currentMembers = doc?.membersID || [];

        // Comparamos si hay miembros nuevos asignados
        const hasNewAssignment = currentMembers.some((id: string) => !prevMembers.includes(id));

        if (operation === 'create' || hasNewAssignment) {
          try {
            // 2. Disparar el trigger hacia n8n
            await fetch('https://n8n-n8n.n4k6yy.easypanel.host/webhook-test/62ad72ab-865f-4893-80fa-1c55d686d916', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                evento: 'colaborador_asignado',
                tipo: 'tarea', // o 'subtarea' según la colección
                task: doc
              }),
            });
          } catch (error) {
            console.error('Error enviando trigger a n8n:', error);
          }
        }
      }
    ]
  }
}
