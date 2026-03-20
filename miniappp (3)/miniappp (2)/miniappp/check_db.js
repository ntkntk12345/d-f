import mysql from 'mysql2/promise';

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'daovang_db'
};

async function test() {
    try {
        const pool = mysql.createPool(dbConfig);
        console.log("Checking tables...");
        const [rows] = await pool.query("SHOW TABLES");
        console.log("Tables:", rows);

        const [refs] = await pool.query("SELECT * FROM referrals");
        console.log("Referral data:", refs);

        const [users] = await pool.query("SELECT teleId, username, referrals FROM users LIMIT 5");
        console.log("Users sample:", users);

        await pool.end();
    } catch (e) {
        console.error("DB Error:", e);
    }
}

test();
