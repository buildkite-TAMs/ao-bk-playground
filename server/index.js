const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const routerApp = require('./router-app')
dotenv.config()

const app = express();
app.use(cors());
app.use(express.json());

const apiPort = process.env.PORT;

app.get('/', (req, res) => {
  res.send("Hello this is a new appp")
})
app.use('/api', routerApp);


const server = app.listen(apiPort, () => {
  console.log(`======== SERVER RUNNING ON PORT: ${apiPort}==========`)
})

module.exports = {
  app,
  server
}
