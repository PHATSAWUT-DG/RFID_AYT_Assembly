// dotenv must load before any module that reads process.env at require time.
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const { createApp } = require('./app');
const db = require('./db');
const { createLogger } = require('./shared/logger');
const { createMasterModule } = require('./modules/master');
const assemblyRoutes = require('./routes/assembly');

// Module routers first: they replace the old handlers in routes/assembly.js.
const apiRouter = express.Router();
apiRouter.use(createMasterModule({ db }));
apiRouter.use(assemblyRoutes);

// Must scale to 60+ reader nodes later.
const logger = createLogger({ dir: process.env.LOG_DIR || path.join(__dirname, 'logs') });
const app = createApp({ apiRouter, logger });

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
