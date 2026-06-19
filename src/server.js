const express = require("express");

const app = express();
const port = 5000;

app.get('/', (req, res) => {
  res.send("Home Page")
})

app.listen(port, () => {
  console.log("Server is tunning on ", port)
})