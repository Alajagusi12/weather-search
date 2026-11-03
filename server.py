import os
import requests
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
KEY = os.environ.get("OPENWEATHER_KEY", "")
ALLOWED = {"data/2.5/weather", "data/2.5/forecast", "data/2.5/air_pollution", "geo/1.0/direct"}

@app.get("/<path:path>")
def proxy(path):
    if path not in ALLOWED:
        return jsonify(error="Not allowed"), 404
    if not KEY:
        return jsonify(error="Set the OPENWEATHER_KEY environment variable"), 500
    r = requests.get(f"https://api.openweathermap.org/{path}", params={**request.args, "appid": KEY}, timeout=10)
    return Response(r.content, status=r.status_code, content_type=r.headers.get("Content-Type", "application/json"))

if __name__ == "__main__":
    app.run(port=5001)