// dotenv must load before any module that reads process.env at require time.
require('dotenv').config();
const { createApp } = require('./app');
const assemblyRoutes = require('./routes/assembly');

// Must scale to 60+ reader nodes later.
const app = createApp({ apiRouter: assemblyRoutes });

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
