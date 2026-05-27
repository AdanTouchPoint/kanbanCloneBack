import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Columns } from './collections/Columns'
import { Tasks } from './collections/Tasks'
import { Boards } from './collections/Boards'
import { Checklists } from './collections/Checklists'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Columns, Tasks, Boards, Checklists],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  cors: '*',
  csrf: ['http://localhost:3000', 'http://localhost:5173'],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  sharp,
  plugins: [],
})
