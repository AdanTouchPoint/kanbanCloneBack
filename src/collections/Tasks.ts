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
      async ({ doc, req, operation }) => {
        try {
          // 1. Volver a consultar el documento usando la Local API para inflar las relaciones (depth: 3)
          const populatedTask = await req.payload.findByID({
            collection: 'tasks',
            id: doc.id,
            depth: 3, // <--- Aquí defines la profundidad que necesitas
            req,      // Pasar el request para mantener el contexto de usuario/permisos si aplica
          });

          // 2. Opcional: Si quieres mantener tu lógica de "solo si hay miembros asignados"
          // Como ahora está populado, 'membersID' podría ser un objeto. 
          // Evaluamos si existe algún miembro asignado.
          if (populatedTask.membersID) {
            
            // 3. Enviar a n8n el objeto completamente populado
            await fetch('https://n8n-n8n.n4k6yy.easypanel.host/webhook/62ad72ab-865f-4893-80fa-1c55d686d916', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                evento: 'colaborador_asignado',
                tipo: 'tarea',
                task: populatedTask // <--- Enviamos el documento con depth 3
              }),
            });

            console.log('Webhook enviado a n8n con relaciones completas (depth 3)');
          }
        } catch (error) {
          console.error('Error en el hook afterChange al poblar datos o enviar a n8n:', error);
        }
      }
    ]
  }
}
