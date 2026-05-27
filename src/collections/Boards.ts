import type { CollectionConfig } from 'payload'

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
}
