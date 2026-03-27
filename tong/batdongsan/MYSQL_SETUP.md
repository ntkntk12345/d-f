**MySQL Setup**

File SQL chinh:
`/mysql-app-schema.sql`

File nay tao schema MySQL cho:
- `users`
- `properties`
- `property_images`
- `property_videos`
- `messages`
- `group_chats`
- `group_members`
- `group_messages`
- `roommate_posts`
- `roommate_likes`
- `roommate_comments`

**Import Schema**

1. Tao database va import bang command line:

```bash
mysql -u root -p < mysql-app-schema.sql
```

2. Hoac vao MySQL shell:

```sql
SOURCE C:/duong-dan-toi-project/mysql-app-schema.sql;
```

3. Neu dung phpMyAdmin:
- Chon tab `Import`
- Chon file `mysql-app-schema.sql`
- Bam `Go`

**Import Du Lieu Phong**

Repo da co san script generate SQL MySQL cho du lieu phong local.

Neu ban van dang dung workspace root thi chay:

```bash
pnpm --filter @workspace/scripts run generate-mysql-properties
```

Script se tao file:
`/artifacts/batdongsan/properties.mysql.sql`

Sau do import file nay vao MySQL:

```bash
mysql -u root -p batdongsan < artifacts/batdongsan/properties.mysql.sql
```

**Connection String**

MySQL hay dung:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=batdongsan
```

Neu thu vien can URI:

```env
MYSQL_URL=mysql://root:your_password@127.0.0.1:3306/batdongsan
```

**Connect Backend**

Backend da duoc doi sang MySQL.

Ban co the dung 1 trong 2 cach:

1. Dung `DATABASE_URL`

```env
DATABASE_URL=mysql://root:your_password@127.0.0.1:3306/batdongsan
```

2. Hoac dung bo bien `MYSQL_*`

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=batdongsan
```

File mau backend local:
`/api-server/.env.example`

**Vi Du Connect MySQL Bang Drizzle**

```ts
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

export const db = drizzle(pool, { schema, mode: "default" });
```

**Chay App**

1. Import schema:

```bash
mysql -u root -p < mysql-app-schema.sql
```

2. Tao file `/api-server/.env` tu file mau.

3. Chay ca frontend va backend ngay trong folder `batdongsan`:

```bash
npm run dev
```

4. Neu muon chay rieng backend:

```bash
npm run dev:server
```

5. Neu muon chay rieng frontend:

```bash
npm run dev:client
```

6. Neu muon gui ma xac minh qua Zalo khi dang ky, can chay them service bot o folder `../bot`:

```bash
python khaicute.py
```

Mac dinh backend se goi bot qua:

```env
ZALO_BOT_BASE_URL=http://127.0.0.1:5050
```

**Ket Luan**

Sau khi import schema va set `.env`, ban co the chi dung 1 folder `batdongsan` de sua code va chay ca frontend/backend.
