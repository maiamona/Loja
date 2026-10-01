const express = require('express');
const router = express.Router();
const multer = require('multer');
const oracledb = require('oracledb');
const { conectar } = require('../config/database');


// =====================================================
// CONFIGURAÇÃO DO MULTER
// Receber imagem em memória para gravar no Oracle BLOB
// =====================================================

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    },

    fileFilter: (req, file, cb) => {

        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de imagem são permitidos.'));
        }

    }
});


// =====================================================
// GET /api/produtos
// Listar todos os produtos
// =====================================================

router.get('/', async (req, res) => {

    let connection;

    try {

        connection = await conectar();

        const result = await connection.execute(
            `
            SELECT
                ID,
                CODIGO_BARRAS,
                NOME,
                DESCRICAO,
                CATEGORIA,
                PRECO,
                ESTOQUE,
                DATA_CADASTRO
            FROM PRODUTOS
            ORDER BY ID
            `,
            [],
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        const produtos = result.rows.map(produto => ({
            id: produto.ID,
            codigoBarras: produto.CODIGO_BARRAS,
            nome: produto.NOME,
            descricao: produto.DESCRICAO,
            categoria: produto.CATEGORIA,
            preco: produto.PRECO,
            estoque: produto.ESTOQUE,
            dataCadastro: produto.DATA_CADASTRO
        }));

        res.json({
            sucesso: true,
            total: produtos.length,
            produtos: produtos
        });

    } catch (erro) {

        console.error('Erro ao listar produtos:', erro);

        if (!res.headersSent) {
            res.status(500).json({
                sucesso: false,
                mensagem: 'Erro ao listar produtos.',
                erro: erro.message
            });
        }

    } finally {

        if (connection) {

            try {
                await connection.close();
            } catch (erro) {
                console.error('Erro ao fechar conexão:', erro);
            }

        }

    }

});


// =====================================================
// POST /api/produtos
// Cadastrar novo produto
//
// A regra de negócio fica na procedure Oracle:
// SP_CADASTRAR_PRODUTO
// =====================================================

router.post('/', async (req, res) => {

    let connection;

    try {

        const {
            codigoBarras,
            nome,
            descricao,
            categoria,
            preco,
            estoque
        } = req.body;


        // =================================================
        // VALIDAÇÕES
        // =================================================

        if (!codigoBarras) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O código de barras é obrigatório.'
            });

        }


        if (!nome) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O nome do produto é obrigatório.'
            });

        }


        if (preco === undefined || preco === null || preco === '') {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O preço é obrigatório.'
            });

        }


        if (estoque === undefined || estoque === null || estoque === '') {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O estoque é obrigatório.'
            });

        }


        // =================================================
        // CONVERTER VALORES NUMÉRICOS
        // =================================================

        const precoNumero = Number(preco);
        const estoqueNumero = Number(estoque);


        if (Number.isNaN(precoNumero)) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O preço deve ser um número válido.'
            });

        }


        if (Number.isNaN(estoqueNumero)) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'O estoque deve ser um número válido.'
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
            `
            BEGIN
                SP_CADASTRAR_PRODUTO(
                    :P_CODIGO_BARRAS,
                    :P_NOME,
                    :P_DESCRICAO,
                    :P_CATEGORIA,
                    :P_PRECO,
                    :P_ESTOQUE
                );
            END;
            `,
            {
                P_CODIGO_BARRAS: codigoBarras,
                P_NOME: nome,
                P_DESCRICAO: descricao || null,
                P_CATEGORIA: categoria || null,
                P_PRECO: precoNumero,
                P_ESTOQUE: estoqueNumero
            },
            {
                autoCommit: true
            }
        );


        // =================================================
        // LOCALIZAR PRODUTO CADASTRADO
        // =================================================

        const resultado = await connection.execute(
            `
            SELECT
                ID,
                CODIGO_BARRAS,
                NOME,
                DESCRICAO,
                CATEGORIA,
                PRECO,
                ESTOQUE,
                DATA_CADASTRO
            FROM PRODUTOS
            WHERE CODIGO_BARRAS = :codigoBarras
            `,
            {
                codigoBarras: codigoBarras
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );


        const produto = resultado.rows[0];


        if (!produto) {

            return res.status(500).json({
                sucesso: false,
                mensagem: 'Produto cadastrado, mas não foi possível localizar o registro.'
            });

        }


        // =================================================
        // RESPOSTA
        // =================================================

        res.status(201).json({

            sucesso: true,

            mensagem: 'Produto cadastrado com sucesso.',

            produto: {
                id: produto.ID,
                codigoBarras: produto.CODIGO_BARRAS,
                nome: produto.NOME,
                descricao: produto.DESCRICAO,
                categoria: produto.CATEGORIA,
                preco: produto.PRECO,
                estoque: produto.ESTOQUE,
                dataCadastro: produto.DATA_CADASTRO
            }

        });


    } catch (erro) {

        console.error('Erro ao cadastrar produto:', erro);

        if (!res.headersSent) {

            res.status(400).json({

                sucesso: false,

                mensagem: 'Não foi possível cadastrar o produto.',

                erro: erro.message

            });

        }


    } finally {

        if (connection) {

            try {
                await connection.close();
            } catch (erro) {
                console.error('Erro ao fechar conexão:', erro);
            }

        }

    }

});


// =====================================================
// POST /api/produtos/:id/imagem
// Enviar / alterar imagem do produto
// =====================================================

router.post('/:id/imagem', upload.single('imagem'), async (req, res) => {

    let connection;

    try {

        const produtoId = Number(req.params.id);


        if (!Number.isInteger(produtoId)) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'ID do produto inválido.'
            });

        }


        if (!req.file) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'Nenhuma imagem foi enviada.'
            });

        }


        connection = await conectar();


        // =================================================
        // VERIFICAR SE O PRODUTO EXISTE
        // =================================================

        const produto = await connection.execute(
            `
            SELECT ID, NOME
            FROM PRODUTOS
            WHERE ID = :id
            `,
            {
                id: produtoId
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );


        if (produto.rows.length === 0) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Produto não encontrado.'
            });

        }


        // =================================================
        // GRAVAR IMAGEM NO BLOB
        // =================================================

        await connection.execute(
            `
            UPDATE PRODUTOS
            SET IMAGEM = :imagem
            WHERE ID = :id
            `,
            {
                imagem: {
                    val: req.file.buffer,
                    type: oracledb.BLOB
                },

                id: produtoId
            }
        );


        await connection.commit();


        res.json({

            sucesso: true,

            mensagem: 'Imagem enviada com sucesso.',

            produtoId: produtoId,

            nomeProduto: produto.rows[0].NOME,

            nomeArquivo: req.file.originalname,

            tipo: req.file.mimetype,

            tamanho: req.file.size

        });


    } catch (erro) {

        console.error('Erro ao enviar imagem:', erro);


        if (connection) {

            try {
                await connection.rollback();
            } catch (erroRollback) {

                console.error(
                    'Erro ao fazer rollback:',
                    erroRollback
                );

            }

        }


        if (!res.headersSent) {

            res.status(500).json({

                sucesso: false,

                mensagem: 'Erro ao salvar imagem.',

                erro: erro.message

            });

        }


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
// GET /api/produtos/:id/imagem
// Obter imagem do produto
// =====================================================

router.get('/:id/imagem', async (req, res) => {

    let connection;

    try {

        const produtoId = Number(req.params.id);


        // =================================================
        // VALIDAR ID
        // =================================================

        if (!Number.isInteger(produtoId)) {

            return res.status(400).json({
                sucesso: false,
                mensagem: 'ID do produto inválido.'
            });

        }


        // =================================================
        // CONECTAR AO ORACLE
        // =================================================

        connection = await conectar();


        // =================================================
        // BUSCAR IMAGEM
        //
        // IMPORTANTE:
        // fetchInfo informa ao oracledb para retornar
        // o BLOB como Lob.
        // =================================================

        const result = await connection.execute(
            `
            SELECT IMAGEM
            FROM PRODUTOS
            WHERE ID = :id
            `,
            {
                id: produtoId
            }
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Produto não encontrado.'
            });

        }


        const lob = result.rows[0][0];


        if (!lob) {

            return res.status(404).json({
                sucesso: false,
                mensagem: 'Produto não possui imagem.'
            });

        }


        // =================================================
        // LER O BLOB COMPLETAMENTE
        //
        // IMPORTANTE:
        // A conexão NÃO será fechada antes do término
        // desta leitura.
        // =================================================

        const chunks = [];


        await new Promise((resolve, reject) => {

            lob.on('data', chunk => {
                chunks.push(chunk);
            });


            lob.on('end', () => {
                resolve();
            });


            lob.on('error', erro => {
                reject(erro);
            });

        });


        // =================================================
        // TRANSFORMAR EM BUFFER
        // =================================================

        const imagem = Buffer.concat(chunks);


        // =================================================
        // DETECTAR TIPO DA IMAGEM
        // =================================================

        let contentType = 'application/octet-stream';


        // JPEG

        if (
            imagem.length >= 3 &&
            imagem[0] === 0xFF &&
            imagem[1] === 0xD8 &&
            imagem[2] === 0xFF
        ) {

            contentType = 'image/jpeg';

        }


        // PNG

        else if (
            imagem.length >= 4 &&
            imagem[0] === 0x89 &&
            imagem[1] === 0x50 &&
            imagem[2] === 0x4E &&
            imagem[3] === 0x47
        ) {

            contentType = 'image/png';

        }


        // GIF

        else if (
            imagem.length >= 3 &&
            imagem[0] === 0x47 &&
            imagem[1] === 0x49 &&
            imagem[2] === 0x46
        ) {

            contentType = 'image/gif';

        }


        // WEBP

        else if (
            imagem.length >= 12 &&
            imagem[0] === 0x52 &&
            imagem[1] === 0x49 &&
            imagem[2] === 0x46 &&
            imagem[3] === 0x46 &&
            imagem[8] === 0x57 &&
            imagem[9] === 0x45 &&
            imagem[10] === 0x42 &&
            imagem[11] === 0x50
        ) {

            contentType = 'image/webp';

        }


        // =================================================
        // ENVIAR IMAGEM
        // =================================================

        res.setHeader(
            'Content-Type',
            contentType
        );


        res.setHeader(
            'Content-Length',
            imagem.length
        );


        res.send(imagem);


    } catch (erro) {

        console.error(
            'Erro ao obter imagem:',
            erro
        );


        if (!res.headersSent) {

            res.status(500).json({

                sucesso: false,

                mensagem: 'Erro ao obter imagem.',

                erro: erro.message

            });

        }

    } finally {

        // =================================================
        // AGORA SIM PODE FECHAR A CONEXÃO
        //
        // A leitura do BLOB já terminou.
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


module.exports = router;
