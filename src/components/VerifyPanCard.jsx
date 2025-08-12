import React, { useState } from "react";
import axios from "axios";
import "./VerifyPanCard.css";
import Lottie from "lottie-react";
import Success from "../animations/success.json";
import Loading from "../animations/Loading animation blue.json";
const OCR_API_KEY = "K83929765888957"; // Replace with your API key

const VerifyPanCard = () => {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState("pan");
  const [idNumber, setIdNumber] = useState("");
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle"); // idle, loading, success, error
  const [mismatches, setMismatches] = useState([]);
  const [extractedData, setExtractedData] = useState(null);

  const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  // Normalize text by removing non-alphanumeric and lowercasing
  const normalize = (text) =>
    text.toLowerCase().replace(/[^a-z0-9]/gi, "").trim();

  // Format ISO date string yyyy-mm-dd → dd/mm/yyyy
  const formatDateToDDMMYYYY = (isoDate) => {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Extract dates dd/mm/yyyy from OCR text with flexible separators
  const extractAllDatesFromText = (text) => {
    const matches = text.match(/\b\d{2}[\s\/\-]\d{2}[\s\/\-]\d{4}\b/g);
    return matches ? matches.map((d) => d.replace(/[\s\-]/g, "/")) : [];
  };

  // Convert file to base64 string for OCR API input
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = (error) => reject(error);
    });

  // Extract Aadhaar numbers only from lines matching exact pattern
  const extractAadhaarOnlyFromLines = (rawText) => {
    const lines = rawText.split("\n");

    // Filter lines that conform exactly to Aadhaar number format:
    // Either 12 digits continuously or 3 groups of 4 digits separated by spaces
    const aadhaarCandidates = lines
      .map((line) => line.trim())
      .filter(
        (line) =>
          /^(\d{12}|\d{4}\s\d{4}\s\d{4})$/.test(line)
      )
      .map((aadhaar) => aadhaar.replace(/\s/g, "")); // Remove spaces to get pure digits

    return aadhaarCandidates;
  };

  const handleVerify = async () => {
    if (!image) {
      alert("Please upload a card image.");
      return;
    }

    setStatus("loading");
    setExtractedData(null);
    setMismatches([]);

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
      const lines = rawText.split("\n").map((line) => normalize(line));
      const text = normalize(rawText);
      const allDates = extractAllDatesFromText(rawText);

      const mismatched = [];
      const extracted = {};

      // Strict exact normalized name matching
      const expectedName = normalize(name);
      const nameFound = lines.includes(expectedName);
      if (!nameFound) mismatched.push("Name");
      extracted.name = nameFound ? name : "Not Found";

      // DOB exact normalized matching
      const formattedDob = formatDateToDDMMYYYY(dob);
      const dobFound = allDates.some((d) => normalize(d) === normalize(formattedDob));
      if (!dobFound) mismatched.push("DOB");
      extracted.dob = dobFound ? formattedDob : "Not Found";

      // PAN or Aadhaar verification
      if (idType === "pan") {
        const expectedPan = normalize(idNumber);
        const panValid = PAN_REGEX.test(idNumber.toUpperCase());
        const panFound =
          panValid &&
          (text.includes(expectedPan) || lines.some((line) => line.includes(expectedPan)));
        if (!panFound) mismatched.push("PAN");
        extracted.pan = panFound ? idNumber.toUpperCase() : "Not Found";
      } else {
        // Aadhaar: extract only lines that match Aadhaar pattern exactly
        const aadhaarCandidates = extractAadhaarOnlyFromLines(rawText);

        const cleanInput = idNumber.replace(/\D/g, "");

        // Debug logs - remove or comment out in production
        console.log("Extracted Aadhaar candidates:", aadhaarCandidates);
        console.log("User input last 4 digits:", cleanInput);
       
        let aadhaarFound = false;
        if (cleanInput.length === 4) {
          aadhaarFound = aadhaarCandidates.some((a) => a.slice(-4) === cleanInput);
        } else {
          aadhaarFound = false;
        }

        if (!aadhaarFound) mismatched.push("Aadhaar");
        let result=aadhaarCandidates.length > 0 ? aadhaarCandidates.join(", ").slice(0,12) : "Not Found";
        extracted.aadhaar = aadhaarFound
          ? ` ${result}`
          : "Not Found";
      }

      // Extract extra info on full match
      if (mismatched.length === 0) {
        if (idType === "pan") {
          extracted.father_name =
            rawText.match(/(?:Father'?s Name|Fathers Name|S\/O)\s*:?(.+)/i)?.[1]?.trim() ||
            "Not Found";
          extracted.mobile = "N/A";
        } else {
          extracted.father_name = "N/A";
          extracted.mobile = rawText.match(/\b[6-9]\d{9}\b/)?.[0] || "Not Found";
        }
      }

      setExtractedData(extracted);
      setMismatches(mismatched);
      setStatus(mismatched.length === 0 ? "success" : "error");
    } catch (error) {
      console.error("OCR error:", error);
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
            placeholder={
              idType === "pan"
                ? "Enter PAN Number"
                : "Enter Last 4 digits of Aadhaar"
            }
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
  <div className="status loading" role="alert" aria-live="polite" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
    <Lottie animationData={Loading} style={{height: 40, width: 40}} loop={true} />
    <span>Extracting text, please wait...</span>
  </div>
)}


      {status === "success" && extractedData && (
  <div className="status success" role="alert" aria-live="polite" >

    <strong>    <Lottie animationData={Success} style={{height: 40, width: 80,position:"absolute",right:720,bottom:40}} loop={false} />All fields matched!</strong>
    <div className="verified-info">
      {Object.entries(extractedData).map(([key, val]) => (
        <p key={key}>
          <strong>{key.replace(/_/g, " ").toUpperCase()}:</strong> {val}
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
                  <strong>{key.replace(/_/g, " ").toUpperCase()}:</strong> {val}
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
