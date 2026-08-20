const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const routerApp = require('./router-app')
const db = require('./db')
const bodyParser = require('body-parser')
dotenv.config()

const app = express();
app.use(cors());
app.use(bodyParser.json());

const apiPort = process.env.PORT;

db.on('error', console.error.bind(console, "[ERROR] MongoDB connection error "))


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