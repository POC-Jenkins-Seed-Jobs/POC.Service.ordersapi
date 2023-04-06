// Collected from Otel
'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel } = require("@opentelemetry/api");
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

const my_meter = require('./create-a-meter');
const { emitsPayloadMetric, emitReturnTimeMetric } = require('./get-meter-emit-functions')(my_meter)

// NOTE: TracerProvider must be initialized before instrumented packages
// (i.e. 'aws-sdk' and 'http') are imported.
const my_tracer = require('./create-a-tracer');

const http = require('http');
const AWS = require('aws-sdk');

const api = require('@opentelemetry/api');

const shouldSampleAppLog = (process.env.SAMPLE_APP_LOG_LEVEL || "INFO") == "INFO"

require('dotenv').config();

// Load express
const express  = require("express");
const app = express()
const bodyParser = require("body-parser");

app.use(bodyParser.urlencoded({extended: true})); 
app.use(bodyParser.json()); 

// Load Mongoose
const mongoose = require("mongoose");

// Global Order Object which will be the instance of MongoDB document
var Order;
async function connectMongoose() {
	await mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology:true }).then(() =>{
		console.log("mongoose connected..")
	})
	require("./Order");
	Order = mongoose.model("Order")
}


// Define the Initial load
async function initialLoad() {
	await connectMongoose();
}

initialLoad()

// GET all orders for a user
// GET single order for a user
/**
 * A single api can perform multiple operations based on the query params.
 * Also to improve this logic, we can create different util files or modules to handle the separate logic 
 * based on these query params.
 * As this is a straightforward simple condition, I have added them using if else condition here only.
 */
app.get("/orders",async (req, res) => {
	const requestStartTime = new Date();
	// console.log("ji");
	if(!req.query.oid && req.query.uid) {
		Order.find({customerId:req.query.uid}).then( orders => {
			if(JSON.stringify(orders) === "[]") {
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId).status(404).send("Order not found ..")
			}
			else if(orders){
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId).json(orders);
				emitsPayloadMetric(res._contentLength + mimicPayLoadSize(), '/orders', res.statusCode);
				emitReturnTimeMetric(new Date() - requestStartTime, '/user', res.statusCode);
			}
			else {
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId)
				res.sendStatus(404)
			}
		})
	} else if(req.query.oid && req.query.uid) {
		Order.find({_id:req.query.oid, customerId: req.query.uid}).then( (order) => {
			if(JSON.stringify(order) === "[]") {
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId).status(404).send("Order not found ..")
			}
			else if(order){
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId).json(order);
				emitsPayloadMetric(res._contentLength + mimicPayLoadSize(), '/orders', res.statusCode);
				emitReturnTimeMetric(new Date() - requestStartTime, '/user', res.statusCode);
			}
			else {
				res.setHeader("traceId", JSON.parse(getTraceIdJson()).traceId)
				res.sendStatus(404)
			}
		})
	}
})

// Create an order for a user
app.post("/order", async (req, res) => {
	const requestStartTime = new Date();
	const newOrder = {
		"name":req.body.name,
		"customerId":req.body.customerId,
		"amount":req.body.amount,
		"image":req.body.image,
		"createdAt":req.body.createdAt,
		"qty":req.body.qty,
	}
	
	// Create new Order instance..
	const order = new Order(newOrder)
	order.save().then((orderObj) => {
		res.setHeader("traceID", JSON.parse(getTraceIdJson()).traceId).status(201).send(orderObj)
		emitsPayloadMetric(res._contentLength + mimicPayLoadSize(), '/order', res.statusCode);
		emitReturnTimeMetric(new Date() - requestStartTime, '/user', res.statusCode);
	}).catch( (err) => {
		if(err) {
			throw err
		}
	})
	
})


// Delete a single order
app.delete("/orders/:oid", async (req, res) => {
	const requestStartTime = new Date();
	Order.findByIdAndDelete(req.params.oid).then((order) => {
		res.setHeader("traceID", JSON.parse(getTraceIdJson()).traceId)
		if(order){
			res.status(202).send("Order deleted with success...")
			emitsPayloadMetric(res._contentLength + mimicPayLoadSize(), '/orders', res.statusCode);
			emitReturnTimeMetric(new Date() - requestStartTime, '/user', res.statusCode);
		}
		else{
			res.status(404).send("No order found...")
		}
		
	}).catch( () => {
		res.sendStatus(404)
	})
})

// Delete all orders for a user
app.delete("/orders", async (req, res) => {
	// Order.findOneAndDelete({customerId: req.query.uid})
	// Order.deleteMany({customerId : req.query.uid})
	const requestStartTime = new Date();
	Order.deleteMany({customerId : req.query.uid}).then((o) => {
		res.setHeader("traceID", JSON.parse(getTraceIdJson()).traceId)
		if(o.deletedCount > 0) {
			res.send({"success":true})
			emitsPayloadMetric(res._contentLength + mimicPayLoadSize(), '/orders', res.statusCode);
			emitReturnTimeMetric(new Date() - requestStartTime, '/user', res.statusCode);
		} else {
			res.status(404).send({"success":false})
		}
	})
})

// APP listening on port 5151
app.listen(5151, () => {
	console.log("Up and running! -- This is our Orders service")
})


function getTraceIdJson() {
	const otelTraceId = api.trace.getSpan(api.context.active()).spanContext().traceId;
	const timestamp = otelTraceId.substring(0, 8);
	const randomNumber = otelTraceId.substring(8);
	const xrayTraceId = "1-" + timestamp + "-" + randomNumber;
	return JSON.stringify({ "traceId": xrayTraceId });
  }
  
  function mimicPayLoadSize() {
	return Math.random() * 1000;
  }
  
