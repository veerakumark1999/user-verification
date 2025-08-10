import React, { useState } from "react";
import Tesseract from "tesseract.js";
import "./VerifyPanCard.css";
import Fuse from "fuse.js"; // For fuzzy matching

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

  const handleVerify = async () => {
    if (!image) {
      alert("Please upload a card image.");
      return;
    }
    setStatus("loading");

    try {
      const result = await Tesseract.recognize(image, "eng", {
        logger: (m) => console.log(m),
      });

      const rawText = result.data.text;
      setOcrText(rawText);

      const lines = rawText.split("\n").map((line) => normalize(line));
      const text = normalize(rawText);
      const allDates = extractAllDatesFromText(rawText);

      const mismatched = [];
      const extracted = {};

      // Fuzzy Name check
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

      // If all match, try to extract all extra details
      if (!mismatched.length) {
        if (idType === "pan") {
          extracted.father_name =
            rawText.match(/(?:Father|Fathers Name|S\/O)\s*:?(.+)/i)?.[1]?.trim() ||
            "N/A";
          extracted.issue_date = allDates[1] || "N/A";
        } else {
          extracted.gender =
            rawText.match(/Male|Female|Other/i)?.[0] || "N/A";
          extracted.address =
            rawText
              .split("\n")
              .slice(5)
              .join(" ")
              .match(/.{10,}/)?.[0] || "N/A";
          extracted.mobile =
            rawText.match(/\b[6-9]\d{9}\b/)?.[0] || "N/A";
        }
      }

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

        {/* Name */}
        <div className="form-row">
          <label>Name:</label>
          <input
            type="text"
            value={name}
            placeholder="Enter Full Name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* DOB */}
        <div className="form-row">
          <label>Date of Birth:</label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        {/* ID type & number */}
        <div className="form-row">
          <label>ID Type:</label>
          <select
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

        {/* Upload */}
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

        {/* Status */}
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

        {ocrText && (
          <details>
            <summary className="text-blue-600 cursor-pointer">
              Show Extracted OCR Text
            </summary>
            <pre className="bg-gray-100 p-2 text-sm whitespace-pre-wrap">
              {ocrText}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};

export default VerifyPanCard;
