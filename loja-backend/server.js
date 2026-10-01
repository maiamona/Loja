const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { conectar } = require('./config/database');
const produtosRoutes = require('./routes/produtos');
const clientesRoutes = require('./routes/clientes');
const pedidosRoutes = require('./routes/pedidos');
const faturasRoutes = require('./routes/faturas');
const caixaRoutes = require('./routes/caixa');
const movimentacoesEstoqueRoutes =
    require('./routes/movimentacoesEstoque');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/produtos', produtosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/faturas', faturasRoutes);
app.use('/api/caixa', caixaRoutes);
app.use(
    '/api/movimentacoes-estoque',
    movimentacoesEstoqueRoutes
);

//node server.js
// rota inicial
app.get('/', (req, res) => {
    res.json({
        mensagem: 'API Loja funcionando!',
        banco: 'Oracle'
    });
});


// teste Oracle
app.get('/api/teste-oracle', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const resultado = await connection.execute(`
            SELECT
                USER AS usuario,
                SYS_CONTEXT('USERENV', 'CON_NAME') AS container
            FROM dual
        `);

        res.json({
            sucesso: true,
            usuario: resultado.rows[0][0],
            container: resultado.rows[0][1]
        });

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message
        });

    } finally {

        if (connection) {
            await connection.close();
        }

    }

});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});