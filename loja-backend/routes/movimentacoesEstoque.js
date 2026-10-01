const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

const { conectar } = require('../config/database');


// =====================================================
// POST /api/movimentacoes-estoque
// Registar entrada manual de estoque
// =====================================================

router.post('/', async (req, res) => {

    let connection;

    try {

        const {
            produtoId,
            tipo,
            quantidade,
            motivo,
            pedidoId
        } = req.body;


        // =====================================================
        // VALIDAÇÕES
        // =====================================================

        const produtoIdNumerico = Number(produtoId);
        const quantidadeNumerica = Number(quantidade);


        if (
            !Number.isInteger(produtoIdNumerico) ||
            produtoIdNumerico <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    'ID do produto inválido.'

            });

        }


        if (
            !Number.isInteger(quantidadeNumerica) ||
            quantidadeNumerica <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    'A quantidade deve ser um número inteiro maior que zero.'

            });

        }


        // Nesta primeira versão permitimos apenas ENTRADA
        if (tipo !== 'ENTRADA') {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    'Apenas movimentações do tipo ENTRADA são permitidas nesta operação.'

            });

        }


        if (
            !motivo ||
            typeof motivo !== 'string' ||
            motivo.trim().length === 0
        ) {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    'O motivo da movimentação é obrigatório.'

            });

        }


        let pedidoIdNumerico = null;

        if (
            pedidoId !== undefined &&
            pedidoId !== null &&
            pedidoId !== ''
        ) {

            pedidoIdNumerico = Number(pedidoId);


            if (
                !Number.isInteger(pedidoIdNumerico) ||
                pedidoIdNumerico <= 0
            ) {

                return res.status(400).json({

                    sucesso: false,

                    mensagem:
                        'ID do pedido inválido.'

                });

            }

        }


        // =====================================================
        // CONECTAR AO ORACLE
        // =====================================================

        connection = await conectar();


        // =====================================================
        // EXECUTAR PROCEDURE DE MOVIMENTAÇÃO
        // =====================================================

        await connection.execute(
            `
            BEGIN

                SP_MOVIMENTAR_ESTOQUE(
                    :produtoId,
                    :tipo,
                    :quantidade,
                    :motivo,
                    :pedidoId
                );

            END;
            `,
            {
                produtoId: produtoIdNumerico,

                tipo: tipo,

                quantidade: quantidadeNumerica,

                motivo: motivo.trim(),

                pedidoId: pedidoIdNumerico
            }
        );


        // A procedure já executa COMMIT
        res.status(201).json({

            sucesso: true,

            mensagem:
                'Entrada de estoque registada com sucesso.'

        });


    } catch (erro) {

        console.error(
            'Erro ao registar movimentação de estoque:',
            erro
        );


        // Erros de regras de negócio da procedure Oracle
        if (
            erro.errorNum &&
            erro.errorNum >= 20000 &&
            erro.errorNum <= 20999
        ) {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    erro.message
                        .replace(/^ORA-\d+:\s*/, '')
                        .split('\n')[0]

            });

        }


        res.status(500).json({

            sucesso: false,

            mensagem:
                'Erro ao registar movimentação de estoque.',

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
// GET /api/movimentacoes-estoque
// Listar histórico de movimentações
// =====================================================

router.get('/', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const result = await connection.execute(
            `
            SELECT
                M.ID,
                M.PRODUTO_ID,
                P.NOME AS PRODUTO,
                M.TIPO,
                M.QUANTIDADE,
                M.ESTOQUE_ANTERIOR,
                M.ESTOQUE_ATUAL,
                M.MOTIVO,
                M.PEDIDO_ID,
                PE.NUMERO AS PEDIDO,
                M.DATA_MOVIMENTACAO
            FROM MOVIMENTACOES_ESTOQUE M

            INNER JOIN PRODUTOS P
                ON P.ID = M.PRODUTO_ID

            LEFT JOIN PEDIDOS PE
                ON PE.ID = M.PEDIDO_ID

            ORDER BY M.ID DESC
            `,
            [],
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );


        const movimentacoes = result.rows.map(movimentacao => ({

            id: movimentacao.ID,

            produtoId: movimentacao.PRODUTO_ID,

            produto: movimentacao.PRODUTO,

            tipo: movimentacao.TIPO,

            quantidade: movimentacao.QUANTIDADE,

            estoqueAnterior:
                movimentacao.ESTOQUE_ANTERIOR,

            estoqueAtual:
                movimentacao.ESTOQUE_ATUAL,

            motivo: movimentacao.MOTIVO,

            pedidoId:
                movimentacao.PEDIDO_ID,

            pedido:
                movimentacao.PEDIDO,

            dataMovimentacao:
                movimentacao.DATA_MOVIMENTACAO

        }));


        res.json({

            sucesso: true,

            total: movimentacoes.length,

            movimentacoes: movimentacoes

        });


    } catch (erro) {

        console.error(
            'Erro ao listar movimentações de estoque:',
            erro
        );


        res.status(500).json({

            sucesso: false,

            mensagem:
                'Erro ao listar movimentações de estoque.',

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
// GET /api/movimentacoes-estoque/:id
// Buscar uma movimentação específica
// =====================================================

router.get('/:id', async (req, res) => {

    let connection;

    try {

        const movimentacaoId =
            Number(req.params.id);


        if (
            !Number.isInteger(movimentacaoId) ||
            movimentacaoId <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                mensagem:
                    'ID da movimentação inválido.'

            });

        }


        connection = await conectar();


        const result = await connection.execute(
            `
            SELECT
                M.ID,
                M.PRODUTO_ID,
                P.NOME AS PRODUTO,
                M.TIPO,
                M.QUANTIDADE,
                M.ESTOQUE_ANTERIOR,
                M.ESTOQUE_ATUAL,
                M.MOTIVO,
                M.PEDIDO_ID,
                PE.NUMERO AS PEDIDO,
                M.DATA_MOVIMENTACAO
            FROM MOVIMENTACOES_ESTOQUE M

            INNER JOIN PRODUTOS P
                ON P.ID = M.PRODUTO_ID

            LEFT JOIN PEDIDOS PE
                ON PE.ID = M.PEDIDO_ID

            WHERE M.ID = :id
            `,
            {
                id: movimentacaoId
            },
            {
                outFormat:
                    oracledb.OUT_FORMAT_OBJECT
            }
        );


        if (result.rows.length === 0) {

            return res.status(404).json({

                sucesso: false,

                mensagem:
                    'Movimentação não encontrada.'

            });

        }


        const movimentacao =
            result.rows[0];


        res.json({

            sucesso: true,

            movimentacao: {

                id: movimentacao.ID,

                produtoId:
                    movimentacao.PRODUTO_ID,

                produto:
                    movimentacao.PRODUTO,

                tipo:
                    movimentacao.TIPO,

                quantidade:
                    movimentacao.QUANTIDADE,

                estoqueAnterior:
                    movimentacao.ESTOQUE_ANTERIOR,

                estoqueAtual:
                    movimentacao.ESTOQUE_ATUAL,

                motivo:
                    movimentacao.MOTIVO,

                pedidoId:
                    movimentacao.PEDIDO_ID,

                pedido:
                    movimentacao.PEDIDO,

                dataMovimentacao:
                    movimentacao.DATA_MOVIMENTACAO

            }

        });


    } catch (erro) {

        console.error(
            'Erro ao buscar movimentação:',
            erro
        );


        res.status(500).json({

            sucesso: false,

            mensagem:
                'Erro ao buscar movimentação.',

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