const express = require('express');
const router = express.Router();

const oracledb = require('oracledb');
const { conectar } = require('../config/database');


// ============================================
// GET /api/clientes
// Listar todos os clientes
// ============================================

router.get('/', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const resultado = await connection.execute(`
            SELECT
                ID,
                NOME,
                TELEFONE,
                EMAIL,
                ENDERECO,
                CIDADE,
                DATA_CADASTRO
            FROM CLIENTES
            ORDER BY ID
        `);

        const clientes = resultado.rows.map(row => ({
            id: row[0],
            nome: row[1],
            telefone: row[2],
            email: row[3],
            endereco: row[4],
            cidade: row[5],
            dataCadastro: row[6]
        }));

        res.json({
            sucesso: true,
            total: clientes.length,
            clientes: clientes
        });

    } catch (erro) {

        console.error(
            'Erro ao listar clientes:',
            erro
        );

        res.status(500).json({
            sucesso: false,
            erro: erro.message
        });

    } finally {

        if (connection) {

            try {

                await connection.close();

            } catch (erro) {

                console.error(
                    'Erro ao fechar conexão:',
                    erro
                );

            }

        }

    }

});


// ============================================
// POST /api/clientes
// Cadastrar novo cliente
// ============================================

router.post('/', async (req, res) => {

    let connection;

    try {

        const {
            nome,
            telefone,
            email,
            endereco,
            cidade
        } = req.body;


        // ============================================
        // VALIDAR NOME
        // ============================================

        if (!nome || !String(nome).trim()) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O nome do cliente é obrigatório.'
            });

        }


        // ============================================
        // CONECTAR AO ORACLE
        // ============================================

        connection = await conectar();


        // ============================================
        // CHAMAR SP_CADASTRAR_CLIENTE
        // ============================================

        const resultado = await connection.execute(
            `
            BEGIN
                SP_CADASTRAR_CLIENTE(
                    :P_NOME,
                    :P_TELEFONE,
                    :P_EMAIL,
                    :P_ENDERECO,
                    :P_CIDADE,
                    :P_CLIENTE_ID_OUT
                );
            END;
            `,
            {
                P_NOME: {
                    dir: oracledb.BIND_IN,
                    val: String(nome).trim(),
                    type: oracledb.STRING
                },

                P_TELEFONE: {
                    dir: oracledb.BIND_IN,
                    val: telefone
                        ? String(telefone).trim()
                        : null,
                    type: oracledb.STRING
                },

                P_EMAIL: {
                    dir: oracledb.BIND_IN,
                    val: email
                        ? String(email).trim()
                        : null,
                    type: oracledb.STRING
                },

                P_ENDERECO: {
                    dir: oracledb.BIND_IN,
                    val: endereco
                        ? String(endereco).trim()
                        : null,
                    type: oracledb.STRING
                },

                P_CIDADE: {
                    dir: oracledb.BIND_IN,
                    val: cidade
                        ? String(cidade).trim()
                        : null,
                    type: oracledb.STRING
                },

                P_CLIENTE_ID_OUT: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                }
            }
        );


        // ============================================
        // OBTER ID GERADO
        // ============================================

        const clienteId =
            resultado.outBinds.P_CLIENTE_ID_OUT;


        // ============================================
        // BUSCAR CLIENTE CRIADO
        // ============================================

        const consulta = await connection.execute(
            `
            SELECT
                ID,
                NOME,
                TELEFONE,
                EMAIL,
                ENDERECO,
                CIDADE,
                DATA_CADASTRO
            FROM CLIENTES
            WHERE ID = :ID
            `,
            {
                ID: clienteId
            }
        );


        const row =
            consulta.rows &&
            consulta.rows.length > 0
                ? consulta.rows[0]
                : null;


        // ============================================
        // FECHAR CONEXÃO
        // ============================================

        await connection.close();

        connection = null;


        // ============================================
        // RESPOSTA
        // ============================================

        res.status(201).json({

            sucesso: true,

            mensagem:
                'Cliente cadastrado com sucesso.',

            cliente: row
                ? {
                    id: row[0],
                    nome: row[1],
                    telefone: row[2],
                    email: row[3],
                    endereco: row[4],
                    cidade: row[5],
                    dataCadastro: row[6]
                }
                : {
                    id: clienteId,
                    nome: String(nome).trim(),
                    telefone: telefone || null,
                    email: email || null,
                    endereco: endereco || null,
                    cidade: cidade || null
                }

        });

    } catch (erro) {

        console.error(
            'Erro ao cadastrar cliente:',
            erro
        );


        // ============================================
        // FECHAR CONEXÃO EM CASO DE ERRO
        // ============================================

        if (connection) {

            try {

                await connection.close();

            } catch (erroFechar) {

                console.error(
                    'Erro ao fechar conexão:',
                    erroFechar
                );

            }

        }


        // ============================================
        // RESPOSTA DE ERRO
        // ============================================

        res.status(500).json({

            sucesso: false,

            mensagem:
                erro?.message ||
                'Erro ao cadastrar cliente.',

            erro:
                erro?.message ||
                'Erro desconhecido.'

        });

    }

});


module.exports = router;