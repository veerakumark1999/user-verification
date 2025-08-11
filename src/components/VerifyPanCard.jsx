import React, { useState } from "react";
import axios from "axios";
import "./VerifyPanCard.css";
import Fuse from "fuse.js"; // For fuzzy matching

const OCR_API_KEY = "K83929765888957"; // Replace with your API key

const VerifyPanCard = () => {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState("pan");
  const [idNumber, setIdNumber] = useState("");
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [mismatches, setMismatches] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [ocrText, setOcrText] = useState("");

  const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]/;
  const AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/;

  const normalize = (text) =>
    text.toLowerCase().replace(/[^a-z0-9]/gi, "").trim();

  const formatDateToDDMMYYYY = (isoDate) => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const extractAllDatesFromText = (text) => {
    const matches = text.match(/\b\d{2}[\s\/\-]\d{2}[\s\/\-]\d{4}\b/g);
    return matches ? matches.map((d) => d.replace(/[\s\-]/g, "/")) : [];
  };

  const fuzzyIncludes = (lines, target) => {
    const fuse = new Fuse(lines, { includeScore: true, threshold: 0.3 });
    return fuse.search(target).length > 0;
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = (error) => reject(error);
    });

  const handleVerify = async () => {
    if (!image) {
      alert("Please upload a card image.");
      return;
    }
    setStatus("loading");

    try {
      const base64Image = await toBase64(image);

      const formData = new FormData();
      formData.append("apikey", OCR_API_KEY);
      formData.append("base64Image", `data:image/png;base64,${base64Image}`);
      formData.append("language", "eng");
      formData.append("scale", true);
      formData.append("OCREngine", 2);

      const res = await axios.post("https://api.ocr.space/parse/image", formData);

      if (res.data.IsErroredOnProcessing) {
        throw new Error(res.data.ErrorMessage[0]);
      }

      const rawText = res.data.ParsedResults[0].ParsedText;
      setOcrText(rawText);

      const lines = rawText.split("\n").map((line) => normalize(line));
      const text = normalize(rawText);
      const allDates = extractAllDatesFromText(rawText);

      const mismatched = [];
      const extracted = {};

      // Name check
      const expectedName = normalize(name);
      const nameFound = fuzzyIncludes(lines, expectedName);
      if (!nameFound) mismatched.push("Name");
      extracted.name = nameFound ? name : "Not Found";

      // DOB check
      const formattedDob = formatDateToDDMMYYYY(dob);
      const dobFound = allDates.some(
        (d) => normalize(d) === normalize(formattedDob)
      );
      if (!dobFound) mismatched.push("DOB");
      extracted.dob = dobFound ? formattedDob : "Not Found";

      // ID number check
           // ID number check
      if (idType === "pan") {
        const expectedPan = normalize(idNumber);
        const panFound =
          PAN_REGEX.test(idNumber) &&
          (text.includes(expectedPan) || fuzzyIncludes(lines, expectedPan));
        if (!panFound) mismatched.push("PAN");
        extracted.pan = panFound ? idNumber.toUpperCase() : "Not Found";
      } else {
        const aadhaarClean = idNumber.replace(/\s+/g, "");
        const aadhaarFound =
          AADHAAR_REGEX.test(idNumber) &&
          (text.replace(/\s+/g, "").includes(aadhaarClean) ||
            fuzzyIncludes(lines, aadhaarClean));
        if (!aadhaarFound) mismatched.push("Aadhaar");
        extracted.aadhaar = aadhaarFound ? idNumber : "Not Found";
      }

      // ✅ Add this new part here
      if (!mismatched.length) {
        if (idType === "pan") {
          extracted.father_name =
            rawText.match(/(?:Father'?s Name|Fathers Name|S\/O)\s*:?(.+)/i)?.[1]?.trim() ||
            "Not Found";
          extracted.mobile = "N/A";
        } else {
          extracted.father_name = "N/A";
          extracted.mobile =
            rawText.match(/\b[6-9]\d{9}\b/)?.[0] || "Not Found";
        }
      }
      // ✅ End new part

      setExtractedData(extracted);
      setMismatches(mismatched);
      setStatus(mismatched.length ? "error" : "success");


      setExtractedData(extracted);
      setMismatches(mismatched);
      setStatus(mismatched.length ? "error" : "success");
    } catch (err) {
      console.error("OCR error:", err);
      setStatus("error");
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2 className="title">🧾 Document Verification</h2>

        <div className="form-row">
          <label>Name:</label>
          <input
            type="text"
            value={name}
            placeholder="Enter Full Name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>Date of Birth:</label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>ID Type:</label>
          <select
          id="id-input"
            value={idType}
            onChange={(e) => {
              setIdType(e.target.value);
              setIdNumber("");
            }}
          >
            <option value="pan">PAN Card</option>
            <option value="aadhaar">Aadhaar Card</option>
          </select>
          <input
            type="text"
            value={idNumber}
            placeholder={idType === "pan" ? "Enter PAN Number" : "Enter Aadhaar Number"}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>

        <div className="upload-section">
          <label>Upload Card Image:</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
          />
        </div>

        <button onClick={handleVerify} className="btn verify-btn">
          🔍 Verify
        </button>

        {status === "loading" && (
          <p className="status loading">🔄 Extracting text, please wait...</p>
        )}

        {status === "success" && extractedData && (
          <div className="status success">
            ✅ <strong>All fields matched!</strong>
            <div className="verified-info">
              {Object.entries(extractedData).map(([key, val]) => (
                <p key={key}>
                  <strong>{key.replace("_", " ").toUpperCase()}:</strong> {val}
                </p>
              ))}
            </div>
          </div>
        )}

        {status === "error" && extractedData && (
          <div className="status error">
            ❌ <strong>Mismatched Fields:</strong>
            <ul>
              {mismatches.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <div className="verified-info">
              {Object.entries(extractedData).map(([key, val]) => (
                <p key={key}>
                  <strong>{key.replace("_", " ").toUpperCase()}:</strong> {val}
                </p>
              ))}
            </div>
          </div>
        )}

       
      </div>
    </div>
  );
};

export default VerifyPanCard;
