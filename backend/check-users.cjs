const { Client } = require("pg");
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_ao5s1NvjRKuS@ep-divine-boat-b3sz1rix-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" });
async function run() {
  await client.connect();
  const r = await client.query('SELECT id, email, name, role FROM "User"');
  console.log("USERS IN DB:", r.rows);
  const issues = await client.query('SELECT id, type, status, "imageUrl" FROM "Issue" LIMIT 5');
  console.log("ISSUES IN DB:", issues.rows);
  await client.end();
}
run().catch(console.error);
