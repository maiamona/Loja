const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { conectar } = require('../config/database');


// =====================================================
// POST /api/faturas
// Gerar fatura de um pedido
// =====================================================

router.post('/', async (req, res) => {

    let connection;

    try {

        const { pedido_id } = req.body;

        if (!pedido_id) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'O campo pedido_id é obrigatório.'
            });
        }

        connection = await conectar();

        const result = await connection.execute(
            `
            BEGIN
                SP_GERAR_FATURA(
                    P_PEDIDO_ID     => :pedido_id,
                    P_FATURA_ID     => :fatura_id,
                    P_NUMERO_FATURA => :numero_fatura,
                    P_MENSAGEM      => :mensagem
                );
            END;
            `,
            {
                pedido_id: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: Number(pedido_id)
                },

                fatura_id: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                },

                numero_fatura: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.STRING,
                    maxSize: 30
                },

                mensagem: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.STRING,
                    maxSize: 200
                }
            }
        );

        return res.status(201).json({

            sucesso: true,

            mensagem: result.outBinds.mensagem,

            fatura: {
                id: result.outBinds.fatura_id,
                pedido_id: Number(pedido_id),
                numero_fatura: result.outBinds.numero_fatura
            }

        });

    } catch (erro) {

        console.error('Erro ao gerar fatura:', erro);

        // ============================================
        // ORA-20312
        // Pedido já possui uma fatura
        // ============================================

        if (erro.errorNum === 20312) {

            try {

                const consulta = await connection.execute(
                    `
                    SELECT
                        ID,
                        PEDIDO_ID,
                        NUMERO_FATURA,
                        DATA_EMISSAO,
                        SUBTOTAL,
                        TAXA_ENTREGA,
                        TOTAL,
                        FORMA_PAGAMENTO,
                        STATUS
                    FROM FATURAS
                    WHERE PEDIDO_ID = :pedido_id
                    `,
                    {
                        pedido_id: {
                            dir: oracledb.BIND_IN,
                            type: oracledb.NUMBER,
                            val: Number(req.body.pedido_id)
                        }
                    },
                    {
                        outFormat: oracledb.OUT_FORMAT_OBJECT
                    }
                );

                if (consulta.rows.length > 0) {

                    const fatura = consulta.rows[0];

                    console.log(
                        'Fatura existente encontrada:',
                        fatura
                    );

                    return res.status(200).json({

                        sucesso: true,

                        mensagem: 'Este pedido já possui uma fatura.',

                        existente: true,

                        fatura: {
                            id: fatura.ID,
                            pedido_id: fatura.PEDIDO_ID,
                            numero_fatura: fatura.NUMERO_FATURA,
                            data_emissao: fatura.DATA_EMISSAO,
                            subtotal: fatura.SUBTOTAL,
                            taxa_entrega: fatura.TAXA_ENTREGA,
                            total: fatura.TOTAL,
                            forma_pagamento: fatura.FORMA_PAGAMENTO,
                            status: fatura.STATUS
                        }

                    });

                }

            } catch (erroConsulta) {

                console.error(
                    'Erro ao procurar fatura existente:',
                    erroConsulta
                );

                return res.status(500).json({
                    sucesso: false,
                    mensagem: 'Não foi possível localizar a fatura existente.',
                    erro: erroConsulta.message
                });
            }
        }

        // ============================================
        // Outros erros
        // ============================================

        return res.status(500).json({

            sucesso: false,

            mensagem: 'Não foi possível gerar a fatura.',

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



// =====================================================
// GET /api/faturas
// Listar todas as faturas
// =====================================================

router.get('/', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const result = await connection.execute(
            `
            SELECT
                ID,
                PEDIDO_ID,
                NUMERO_FATURA,
                DATA_EMISSAO,
                SUBTOTAL,
                TAXA_ENTREGA,
                TOTAL,
                FORMA_PAGAMENTO,
                STATUS
            FROM FATURAS
            ORDER BY ID DESC
            `,
            [],
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        res.json({
            sucesso: true,
            total: result.rows.length,
            faturas: result.rows
        });

    } catch (erro) {

        console.error('Erro ao listar faturas:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível listar as faturas.',
            erro: erro.message
        });

    } finally {

        if (connection) {
            try {
                const { id } = req.params;

                console.log('ID recebido na rota de fatura:', id);

                if (!id || isNaN(id)) {
                    return res.status(400).json({
                        sucesso: false,
                        mensagem: 'ID da fatura inválido.'
                    });
                }
                await connection.close();
            } catch (erro) {
                console.error('Erro ao fechar conexão:', erro);
            }
        }
    }

});

router.get('/pedido/:pedidoId', async (req, res) => {

    let connection;

    try {

        const { pedidoId } = req.params;

        connection = await conectar();

        const result = await connection.execute(
            `
      SELECT
          ID,
          PEDIDO_ID,
          NUMERO_FATURA,
          DATA_EMISSAO,
          SUBTOTAL,
          TAXA_ENTREGA,
          TOTAL,
          FORMA_PAGAMENTO,
          STATUS
      FROM FATURAS
      WHERE PEDIDO_ID = :pedidoId
      `,
            {
                pedidoId: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: Number(pedidoId)
                }
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Nenhuma fatura encontrada para este pedido.'
            });

        }

        const fatura = result.rows[0];

        res.json({
            sucesso: true,
            fatura: {
                id: fatura.ID,
                pedido_id: fatura.PEDIDO_ID,
                numero_fatura: fatura.NUMERO_FATURA,
                data_emissao: fatura.DATA_EMISSAO,
                subtotal: fatura.SUBTOTAL,
                taxa_entrega: fatura.TAXA_ENTREGA,
                total: fatura.TOTAL,
                forma_pagamento: fatura.FORMA_PAGAMENTO,
                status: fatura.STATUS
            }
        });

    } catch (erro) {

        console.error(
            'Erro ao buscar fatura pelo pedido:',
            erro
        );

        res.status(500).json({
            sucesso: false,
            mensagem: 'Não foi possível consultar a fatura.',
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

// =====================================================
// GET /api/faturas/:id
// Buscar fatura completa
// =====================================================

router.get('/:id', async (req, res) => {

    let connection;

    try {

        const { id } = req.params;

        // =====================================================
        // Validar ID
        // =====================================================

        if (!id || isNaN(id)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'ID da fatura inválido.'
            });
        }

        // =====================================================
        // Conectar ao Oracle
        // =====================================================

        connection = await conectar();

        // =====================================================
        // 1. Buscar dados da fatura + pedido + cliente
        // =====================================================

        const faturaResult = await connection.execute(
            `
            SELECT
                F.ID AS FATURA_ID,
                F.PEDIDO_ID,
                F.NUMERO_FATURA,
                F.DATA_EMISSAO,
                F.SUBTOTAL,
                F.TAXA_ENTREGA,
                F.TOTAL,
                F.FORMA_PAGAMENTO,
                F.STATUS AS STATUS_FATURA,

                P.NUMERO AS NUMERO_PEDIDO,
                P.DATA_PEDIDO,
                P.STATUS AS STATUS_PEDIDO,

                C.ID AS CLIENTE_ID,
                C.NOME AS NOME_CLIENTE,
                C.TELEFONE,
                C.EMAIL,
                C.ENDERECO,
                C.CIDADE

            FROM FATURAS F

            INNER JOIN PEDIDOS P
                ON P.ID = F.PEDIDO_ID

           LEFT JOIN CLIENTES C 
            ON C.ID = P.CLIENTE_ID

            WHERE F.ID = :id
            `,
            {
                id: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: Number(id)
                }
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        // =====================================================
        // Fatura não encontrada
        // =====================================================

        if (faturaResult.rows.length === 0) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Fatura não encontrada.'
            });

        }

        const dados = faturaResult.rows[0];

        // =====================================================
        // 2. Buscar itens do pedido
        // =====================================================

        const itensResult = await connection.execute(
            `
            SELECT
                I.ID AS ITEM_ID,
                I.PRODUTO_ID,
                PR.NOME AS PRODUTO,
                I.QUANTIDADE,
                I.PRECO_UNITARIO,
                I.SUBTOTAL

            FROM ITENS_PEDIDO I

            INNER JOIN PRODUTOS PR
                ON PR.ID = I.PRODUTO_ID

            WHERE I.PEDIDO_ID = :pedido_id

            ORDER BY I.ID
            `,
            {
                pedido_id: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: dados.PEDIDO_ID
                }
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        // =====================================================
        // 3. Montar resposta completa
        // =====================================================

        res.json({

            sucesso: true,

            fatura: {

                id: dados.FATURA_ID,

                numero_fatura: dados.NUMERO_FATURA,

                data_emissao: dados.DATA_EMISSAO,

                status: dados.STATUS_FATURA,

                pedido: {

                    id: dados.PEDIDO_ID,

                    numero: dados.NUMERO_PEDIDO,

                    data: dados.DATA_PEDIDO,

                    status: dados.STATUS_PEDIDO

                },

                cliente: {
                    id: dados.CLIENTE_ID || null,
                    nome: dados.NOME_CLIENTE || 'Cliente não identificado',
                    telefone: dados.TELEFONE || null,
                    email: dados.EMAIL || null,
                    endereco: dados.ENDERECO || null,
                    cidade: dados.CIDADE || null
                },

                itens: itensResult.rows,

                valores: {

                    subtotal: dados.SUBTOTAL,

                    taxa_entrega: dados.TAXA_ENTREGA,

                    total: dados.TOTAL

                },

                forma_pagamento: dados.FORMA_PAGAMENTO

            }

        });

    } catch (erro) {

        console.error('Erro ao buscar fatura completa:', erro);

        res.status(500).json({

            sucesso: false,

            mensagem: 'Não foi possível buscar a fatura.',

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

module.exports = router;