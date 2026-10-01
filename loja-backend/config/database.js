const oracledb = require('oracledb');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
};

async function conectar() {
    return await oracledb.getConnection(dbConfig);
}

module.exports = {
    conectar
};