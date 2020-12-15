const express = require('express'),
    morgan = require('morgan'),
    MongoClient = require('mongodb').MongoClient,
    TimeStamp = require('mongodb').Timestamp,
    fs = require('fs'),
    multer = require('multer'),
    AWS = require('aws-sdk');



//Configure AWS S3
const ENDPOINT = new AWS.Endpoint('fra1.digitaloceanspaces.com');
const s3 = new AWS.S3({
    endpoint: ENDPOINT,
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
})    

//Configure port
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

//Configure express app
const app = express();
app.use(morgan('combined'));

//Mongo and make promises 
const DATABASE = 'covid';
const COLLECTION = 'questionaire';
const makeDoc = (params, image) => {
    return {
        user: params.user,
        q1: params.q1,
        q2: params.q2,
        temperature: params.temperature,
        time: new TimeStamp(),
        image: image.filename
    }
}

const readFile = (path) => {

    return new Promise((resolve, reject) => {

        fs.readFile(path, (error, buffer) => {
            if(error != null) {reject(error)}
            else(resolve(buffer))
        })

    })
}

const putImage = (buffer, file) => {

    const params = {
        Bucket: 'chins',
        Key: file.filename,
        Body: buffer,
        ACL: 'public-read',
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: {
            originalName: file.originalname,
            update: (new Date().getTime()).toString()
        }
    }

    return new Promise((resolve, reject) => {

        s3.putObject(params, (error, result) => {
            if(error != null) {reject(error)}
            else{resolve(result)}
        })

    })
}


//Configure MongoClient
const url = 'mongodb://localhost:27017';
const mongoClient = new MongoClient(url, {useNewUrlParser:true, useUnifiedTopology: true});

//Start app
const p0 = new Promise((resolve, reject) => {

    if((!!process.env.ACCESS_KEY) && (!!process.env.SECRET_ACCESS_KEY)){
        resolve();
    }else{
        reject();
    }

})

const p1 = mongoClient.connect()

Promise.all([p0, p1]).then(_ => {

    console.log(">>> Connecting to MongoDb...");
    app.listen(PORT, () => {console.log(`App started on port ${PORT} at ${new Date()}.`)})
})
    .catch(e => {console.log("Unable to connect. App not started.", e)})


//Configure routes 

let multipart = multer({dest: `${__dirname}/tmp`});
app.post('/temperature', multipart.single('image'), (req,res) => {

    console.log(req.file)
    console.log(req.body)
    res.on('finish', () => {fs.unlink(req.file.path, () => {})})
    const doc = makeDoc(req.body, req.file);
    readFile(req.file.path)
        .then(buffer => {putImage(buffer, req.file)

        .then(_ => {mongoClient.db(DATABASE).collection(COLLECTION).insertOne(doc)
        
        .then(_ => {res.status(200).type('application/json').json({})})

        .catch(e => {res.status(500).type('application/json').json({e})})

        })})

})

app.get('/temperature/:user', (req, res) => {

    const user = req.params['user'];
    mongoClient.db(DATABASE).collection(COLLECTION).find({user: {$regex: `^${user}$`, $options: "i"}}).toArray()
    
        .then(result => {
            res.status(200).type('application/json').json(result)
        })

        .catch(e => {res.status(500).type('application/json').json(e)})

})