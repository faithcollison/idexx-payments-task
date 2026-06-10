import { createApp } from './app';
import { createDatabase } from './db/database';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const DB_PATH = process.env.DB_PATH ?? 'payments.db';

const db = createDatabase(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
