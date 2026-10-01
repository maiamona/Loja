const express = require('express');
const router = express.Router();

const oracledb = require('oracledb');
const { conectar } = require('../config/database');

// =====================================================
// POST /api/caixa/finalizar/:pedidoId
// Finalizar venda do Caixa
// Pendente → Em preparação → Entregue
// =====================================================

router.post('/finalizar/:pedidoId', async (req, res) => {

    let connection;

    try {

        const pedidoId = Number(req.params.pedidoId);

        // =================================================
        // VALIDAR ID DO PEDIDO
        // =================================================

        if (!Number.isInteger(pedidoId) || pedidoId <= 0) {

            return res.status(400).json({

                sucesso: false,

                mensagem: 'ID do pedido inválido.'

            });

        }

        // =================================================
        // CONECTAR AO ORACLE
        // =================================================

        connection = await conectar();

        // =================================================
        // CHAMAR PROCEDURE ORACLE
        // =================================================

        await connection.execute(

            `BEGIN
                SP_FINALIZAR_VENDA_CAIXA(
                    P_PEDIDO_ID => :pedidoId
                );
             END;`,

            {
                pedidoId: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: pedidoId
                }
            },

            {
                autoCommit: false
            }

        );

        // =================================================
        // CONFIRMAR TRANSAÇÃO
        // =================================================

        await connection.commit();

        // =================================================
        // CONSULTAR PEDIDO ATUALIZADO
        // =================================================

        const resultado = await connection.execute(

            `SELECT
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
             WHERE ID = :pedidoId`,

            {
                pedidoId: {
                    dir: oracledb.BIND_IN,
                    type: oracledb.NUMBER,
                    val: pedidoId
                }
            },

            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }

        );

        if (resultado.rows.length === 0) {

            return res.status(404).json({

                sucesso: false,

                mensagem: 'Pedido não encontrado.'

            });

        }

        const pedido = resultado.rows[0];

        // =================================================
        // RESPONDER AO ANGULAR
        // =================================================

        return res.status(200).json({

            sucesso: true,

            mensagem: 'Venda do Caixa finalizada com sucesso.',

            pedido

        });

    } catch (erro) {

        console.error(
            'Erro ao finalizar venda do Caixa:',
            erro
        );

        if (connection) {

            try {
                await connection.rollback();
            } catch (erroRollback) {
                console.error(
                    'Erro no rollback:',
                    erroRollback
                );
            }

        }

        return res.status(500).json({

            sucesso: false,

            mensagem:
                erro?.message ||
                'Não foi possível finalizar a venda do Caixa.',

            erro: erro?.errorNum
                ? `ORA-${erro.errorNum}`
                : undefined

        });

    } finally {

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

    }

});

module.exports = router;