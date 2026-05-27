import type { CollectionConfig } from 'payload'

export const Columns: CollectionConfig = {
  slug: 'columns',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'color',
      type: 'select',
      required: true,
      options: [
        { label: 'Purple', value: 'purple' },
        { label: 'Blue', value: 'blue' },
        { label: 'Warning', value: 'warning' },
        { label: 'Success', value: 'success' },
      ],
    },
  ],
}
