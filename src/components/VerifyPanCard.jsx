import React, { useState } from "react";
import axios from "axios";
import "./VerifyPanCard.css";
import Lottie from "lottie-react";

import Loading from "../animations/Loading animation blue.json";

const OCR_API_KEY = "K83929765888957";

const VerifyPanCard = () => {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState("pan");
  const [idNumber, setIdNumber] = useState("");
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [mismatches, setMismatches] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  const normalize = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, "")
      .trim();

  const formatDateToDDMMYYYY = (isoDate) => {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const extractAllDatesFromText = (text) => {
    const matches = text.match(/\b\d{2}[\s/-]\d{2}[\s/-]\d{4}\b/g);
    return matches ? matches.map((d) => d.replace(/[\s-]/g, "/")) : [];
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = (error) => reject(error);
    });

  // ✅ NEW: Robust Aadhaar extraction
  const extractAadhaarFlexible = (rawText) => {
    const matches = rawText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g);
    if (!matches) return [];

    return matches
      .map((num) => num.replace(/\s/g, ""))
      .filter((num) => /^[2-9][0-9]{11}$/.test(num));
  };

  const handleVerify = async () => {
    if (!image) {
      alert("Please upload a card image.");
      return;
    }

    setStatus("loading");
    setExtractedData(null);
    setMismatches([]);
    setErrorMessage("");

    if (image.size > 5 * 1024 * 1024) {
      setErrorMessage("Upload image below 5MB.");
      setStatus("error");
      return;
    }

    try {
      const base64Image = await toBase64(image);

      const formData = new FormData();
      formData.append("apikey", OCR_API_KEY);
      formData.append(
        "base64Image",
        `data:${image.type};base64,${base64Image}`,
      );
      formData.append("language", "eng");
      formData.append("scale", true);
      formData.append("OCREngine", 2);

      const res = await axios.post(
        "https://api.ocr.space/parse/image",
        formData,
        { timeout: 120000 },
      );

      if (res.data.IsErroredOnProcessing) {
        throw new Error(
          Array.isArray(res.data.ErrorMessage)
            ? res.data.ErrorMessage[0]
            : res.data.ErrorMessage,
        );
      }

      const rawText = res.data.ParsedResults[0].ParsedText;

      const lines = rawText.split("\n").map((line) => normalize(line));
      const text = normalize(rawText);
      const allDates = extractAllDatesFromText(rawText);

      const mismatched = [];
      const extracted = {};

      // ✅ Name check
      const expectedName = normalize(name);
      const nameFound = lines.includes(expectedName);

      if (!nameFound) mismatched.push("Name");
      extracted.name = nameFound ? name : "Not Found";

      // ✅ DOB check
      const formattedDob = formatDateToDDMMYYYY(dob);
      const dobFound = allDates.some(
        (d) => normalize(d) === normalize(formattedDob),
      );

      if (!dobFound) mismatched.push("DOB");
      extracted.dob = dobFound ? formattedDob : "Not Found";

      // ✅ PAN or Aadhaar
      if (idType === "pan") {
        const expectedPan = normalize(idNumber);
        const panValid = PAN_REGEX.test(idNumber.toUpperCase());

        const panFound =
          panValid &&
          (text.includes(expectedPan) ||
            lines.some((line) => line.includes(expectedPan)));

        if (!panFound) mismatched.push("PAN");
        extracted.pan = panFound ? idNumber.toUpperCase() : "Not Found";
      } else {
        // 🔥 NEW Aadhaar logic
        const aadhaarCandidates = extractAadhaarFlexible(rawText);

        const cleanInput = idNumber.replace(/\D/g, "");

        console.log("Aadhaar Found:", aadhaarCandidates);

        let aadhaarFound = false;

        if (cleanInput.length === 4) {
          aadhaarFound = aadhaarCandidates.some((a) => a.endsWith(cleanInput));
        } else if (cleanInput.length === 12) {
          aadhaarFound = aadhaarCandidates.includes(cleanInput);
        }

        if (!aadhaarFound) mismatched.push("Aadhaar");

        let result =
          aadhaarCandidates.length > 0 ? aadhaarCandidates[0] : "Not Found";

        extracted.aadhaar = aadhaarFound ? result : "Not Found";
      }

      // ✅ Extra info
      if (mismatched.length === 0) {
        if (idType === "pan") {
          extracted.father_name =
            rawText.match(/(?:Father'?s Name|S\/O)\s*:?(.+)/i)?.[1]?.trim() ||
            "Not Found";
          extracted.mobile = "N/A";
        } else {
          extracted.father_name = "N/A";
          extracted.mobile =
            rawText.match(/\b[6-9]\d{9}\b/)?.[0] || "Not Found";
        }
      }

      setExtractedData(extracted);
      setMismatches(mismatched);
      setStatus(mismatched.length === 0 ? "success" : "error");
    } catch (error) {
      console.error(error);
      setErrorMessage("OCR failed. Try a clearer image.");
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
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>DOB:</label>
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
            <option value="pan">PAN</option>
            <option value="aadhaar">Aadhaar</option>
          </select>

          <input
            type="text"
            value={idNumber}
            placeholder={
              idType === "pan" ? "Enter PAN" : "Enter Aadhaar / Last 4 digits"
            }
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>

        <div className="upload-section">
          <input type="file" onChange={(e) => setImage(e.target.files[0])} />
        </div>

        <button onClick={handleVerify} className="btn">
          Verify
        </button>

        {status === "loading" && (
          <div className="status loading">
            <Lottie animationData={Loading} style={{ height: 40 }} />
            Processing...
          </div>
        )}

        {status === "success" && extractedData && (
          <div className="status success">
            <strong>☑️ All fields matched!</strong>

            <div className="verified-info">
              <p>
                <strong>NAME:</strong> {extractedData.name}
              </p>

              <p>
                <strong>DOB:</strong> {extractedData.dob}
              </p>

              {idType === "pan" ? (
                <>
                  <p>
                    <strong>PAN NUMBER:</strong> {extractedData.pan}
                  </p>
                  <p>
                    <strong>FATHER NAME:</strong> {extractedData.father_name}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>AADHAAR NUMBER:</strong> {extractedData.aadhaar}
                  </p>
                  <p>
                    <strong>MOBILE:</strong> {extractedData.mobile}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="status error">
            ❌ Error
            <p>{errorMessage}</p>
            {mismatches.length > 0 && (
              <p>Mismatched: {mismatches.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyPanCard;
