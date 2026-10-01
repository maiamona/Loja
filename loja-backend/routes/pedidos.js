const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

const { conectar } = require('../config/database');


// =====================================================
// GET /api/pedidos
// Listar todos os pedidos
// =====================================================

router.get('/', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const result = await connection.execute(
            `
            SELECT
                ID,
                CLIENTE_ID,
                NUMERO,
                DATA_PEDIDO,
                STATUS,
                FORMA_PAGAMENTO,
                SUBTOTAL,
                TAXA_ENTREGA,
                TOTAL
            FROM PEDIDOS
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
            pedidos: result.rows
        });

    } catch (erro) {

        console.error('Erro ao listar pedidos:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao listar pedidos.',
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
// POST /api/pedidos
// Criar pedido através da SP_CRIAR_PEDIDO
// =====================================================

router.post('/', async (req, res) => {

    let connection;

    try {

        const {
            clienteId,
            formaPagamento,
            taxaEntrega,
            itens
        } = req.body;


        // =================================================
        // CLIENTE
        // =================================================
        // clienteId pode ser:
        //
        // número -> cliente cadastrado
        // null   -> venda anónima
        //
        // =================================================

        let clienteIdOracle = null;

        if (
            clienteId !== null &&
            clienteId !== undefined &&
            clienteId !== ''
        ) {

            clienteIdOracle = Number(clienteId);

            if (
                !Number.isInteger(clienteIdOracle) ||
                clienteIdOracle <= 0
            ) {

                return res.status(400).json({
                    sucesso: false,
                    mensagem: 'clienteId inválido.'
                });

            }

        }


        // =================================================
        // Validar forma de pagamento
        // =================================================

        if (
            !formaPagamento ||
            !String(formaPagamento).trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'formaPagamento é obrigatório.'
            });

        }


        // =================================================
        // Validar taxa de entrega
        // =================================================

        if (
            taxaEntrega === undefined ||
            taxaEntrega === null
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'taxaEntrega é obrigatória.'
            });

        }

        const taxaEntregaNumero = Number(taxaEntrega);

        if (
            Number.isNaN(taxaEntregaNumero) ||
            taxaEntregaNumero < 0
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'taxaEntrega inválida.'
            });

        }


        // =================================================
        // Validar itens
        // =================================================

        if (
            !Array.isArray(itens) ||
            itens.length === 0
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O pedido precisa ter pelo menos um item.'
            });

        }


        // =================================================
        // Abrir conexão Oracle
        // =================================================

        connection = await conectar();


        // =================================================
        // Obter os tipos Oracle
        // =================================================

        const ItemPedido =
            await connection.getDbObjectClass('T_ITEM_PEDIDO');

        const ListaItens =
            await connection.getDbObjectClass('T_LISTA_ITENS');


        // =================================================
        // Criar coleção Oracle T_LISTA_ITENS
        // =================================================

        const listaItens = new ListaItens();


        // =================================================
        // Adicionar cada item à coleção
        // =================================================

        for (const item of itens) {

            const produtoId = Number(item.produtoId);
            const quantidade = Number(item.quantidade);


            // =================================================
            // Validar produto
            // =================================================

            if (
                !Number.isInteger(produtoId) ||
                produtoId <= 0
            ) {

                return res.status(400).json({
                    sucesso: false,
                    mensagem: 'produtoId inválido.'
                });

            }


            // =================================================
            // Validar quantidade
            // =================================================

            if (
                !Number.isInteger(quantidade) ||
                quantidade <= 0
            ) {

                return res.status(400).json({
                    sucesso: false,
                    mensagem:
                        'A quantidade deve ser maior que zero.'
                });

            }


            // =================================================
            // Criar objeto T_ITEM_PEDIDO
            // =================================================

            const itemOracle = new ItemPedido({
                PRODUTO_ID: produtoId,
                QUANTIDADE: quantidade
            });


            // =================================================
            // Adicionar à coleção Oracle
            // =================================================

            listaItens.append(itemOracle);

        }


        // =================================================
        // Chamar SP_CRIAR_PEDIDO
        // =================================================

        const result = await connection.execute(
            `
            BEGIN

                SP_CRIAR_PEDIDO(
                    :clienteId,
                    :formaPagamento,
                    :taxaEntrega,
                    :itens,
                    :pedidoId,
                    :numeroPedido
                );

            END;
            `,
            {

                // =========================================
                // IMPORTANTE:
                // Pode ser número ou NULL
                // =========================================

                clienteId: {
                    dir: oracledb.BIND_IN,
                    val: clienteIdOracle,
                    type: oracledb.NUMBER
                },

                formaPagamento: {
                    dir: oracledb.BIND_IN,
                    val: String(formaPagamento).trim(),
                    type: oracledb.STRING
                },

                taxaEntrega: {
                    dir: oracledb.BIND_IN,
                    val: taxaEntregaNumero,
                    type: oracledb.NUMBER
                },

                itens: {
                    dir: oracledb.BIND_IN,
                    val: listaItens
                },

                pedidoId: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                },

                numeroPedido: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.STRING,
                    maxSize: 50
                }

            }
        );


        // =================================================
        // Obter ID e número retornados
        // =================================================

        const pedidoId =
            result.outBinds.pedidoId;

        const numeroPedido =
            result.outBinds.numeroPedido;


        // =================================================
        // Buscar pedido criado
        // =================================================

        const pedidoCriado =
            await connection.execute(
                `
                SELECT
                    ID,
                    CLIENTE_ID,
                    NUMERO,
                    DATA_PEDIDO,
                    STATUS,
                    FORMA_PAGAMENTO,
                    SUBTOTAL,
                    TAXA_ENTREGA,
                    TOTAL
                FROM PEDIDOS
                WHERE ID = :id
                `,
                {
                    id: pedidoId
                },
                {
                    outFormat:
                        oracledb.OUT_FORMAT_OBJECT
                }
            );


        // =================================================
        // Resposta
        // =================================================

        res.status(201).json({

            sucesso: true,

            mensagem:
                clienteIdOracle === null
                    ? 'Venda anónima criada com sucesso.'
                    : 'Pedido criado com sucesso.',

            pedido: pedidoCriado.rows[0],

            pedidoId: pedidoId,

            numeroPedido: numeroPedido

        });


    } catch (erro) {

        console.error(
            'Erro ao criar pedido:',
            erro
        );


        // =================================================
        // Rollback
        // =================================================

        if (connection) {

            try {

                await connection.rollback();

            } catch (rollbackError) {

                console.error(
                    'Erro no rollback:',
                    rollbackError
                );

            }

        }


        // =================================================
        // Resposta de erro
        // =================================================

        res.status(500).json({

            sucesso: false,

            mensagem: 'Erro ao criar pedido.',

            erro: erro.message

        });

    } finally {

        // =================================================
        // Fechar conexão
        // =================================================

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
// PUT /api/pedidos/:id/status
// Atualizar o status do pedido
// =====================================================

router.put('/:id/status', async (req, res) => {

    let connection;

    try {

        const pedidoId =
            Number(req.params.id);

        const { status } =
            req.body;


        // =================================================
        // Validar ID
        // =================================================

        if (
            !pedidoId ||
            isNaN(pedidoId)
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'ID do pedido inválido.'
            });

        }


        // =================================================
        // Validar status
        // =================================================

        if (
            !status ||
            typeof status !== 'string'
        ) {

            return res.status(400).json({
                sucesso: false,
                mensagem:
                    'O status do pedido é obrigatório.'
            });

        }


        connection = await conectar();


        // =================================================
        // Chamar procedure Oracle
        // =================================================

        await connection.execute(
            `
            BEGIN

                SP_ATUALIZAR_STATUS_PEDIDO(
                    :pedidoId,
                    :novoStatus
                );

            END;
            `,
            {

                pedidoId: {
                    dir: oracledb.BIND_IN,
                    val: pedidoId,
                    type: oracledb.NUMBER
                },

                novoStatus: {
                    dir: oracledb.BIND_IN,
                    val: status
                }

            }
        );


        // =================================================
        // Buscar pedido atualizado
        // =================================================

        const resultado =
            await connection.execute(
                `
                SELECT
                    ID,
                    CLIENTE_ID,
                    NUMERO,
                    DATA_PEDIDO,
                    STATUS,
                    FORMA_PAGAMENTO,
                    SUBTOTAL,
                    TAXA_ENTREGA,
                    TOTAL
                FROM PEDIDOS
                WHERE ID = :pedidoId
                `,
                {
                    pedidoId: {
                        dir: oracledb.BIND_IN,
                        val: pedidoId,
                        type: oracledb.NUMBER
                    }
                },
                {
                    outFormat:
                        oracledb.OUT_FORMAT_OBJECT
                }
            );


        if (
            resultado.rows.length === 0
        ) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Pedido não encontrado.'
            });

        }


        res.json({

            sucesso: true,

            mensagem:
                'Status do pedido atualizado com sucesso.',

            pedido:
                resultado.rows[0]

        });


    } catch (erro) {

        console.error(
            'Erro ao atualizar status do pedido:',
            erro
        );

        res.status(400).json({

            sucesso: false,

            mensagem:
                'Não foi possível atualizar o status do pedido.',

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