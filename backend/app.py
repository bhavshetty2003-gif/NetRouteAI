from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)

CORS(app)


@app.route("/")
def home():
    return jsonify({
        "status": "success",
        "message": "NetRouteAI Backend is running"
    })


@app.route("/api/status")
def status():
    return jsonify({
        "backend": "online",
        "project": "NetRouteAI"
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
