import { useState, useRef } from 'react';
import { reportHazard } from '../services/api';

export default function ImageAnalyzer({ onAnalysisComplete }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setAnalysis(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // This calls POST /api/report on the FastAPI backend
      // Sends the image for Vertex AI Gemini vision analysis
      const data = await reportHazard(
        'User Upload',    // location
        3.139,            // latitude (default: KL)
        101.6869,         // longitude
        file
      );
      setAnalysis(data);
      if (typeof onAnalysisComplete === 'function') {
        onAnalysisComplete(data);
      }
    } catch (err) {
      setAnalysis({ hazard: 'Error', severity: 'N/A', analysis: 'Failed to analyze image. Is the backend running?' });
    }
    setLoading(false);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header__title">Image Analyzer</span>
        {loading && <span className="spinner" />}
      </div>
      <div className="panel-body">
        {/* Drag & Drop Upload Zone */}
        <div
          className={`image-upload ${dragOver ? 'image-upload--dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="image-upload__icon">📷</div>
          <div className="image-upload__text">
            Drag & Drop Disaster Image<br />For AI Analysis
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => handleFile(e.target.files[0])}
          />
          {preview && (
            <img src={preview} alt="Preview" className="image-upload__preview" />
          )}
        </div>

        {/* Analyze Button */}
        {file && !analysis && (
          <button
            className="map-search__btn"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? 'ANALYZING...' : 'ANALYZE IMAGE'}
          </button>
        )}

        {/* AI Analysis Output */}
        {analysis && (
          <div className="ai-output fade-in">
            <div className="ai-output__label">AI Analysis Result</div>
            <div style={{ marginBottom: 4 }}>
              <strong>Hazard:</strong>{' '}
              <span style={{ color: 'var(--accent-red)' }}>{analysis.hazard}</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <strong>Severity:</strong>{' '}
              <span style={{
                color: analysis.severity?.toLowerCase().includes('high') ? 'var(--accent-red)' :
                       analysis.severity?.toLowerCase().includes('medium') ? 'var(--accent-orange)' : 'var(--accent-green)'
              }}>
                {analysis.severity}
              </span>
            </div>
            <div>{analysis.analysis}</div>
          </div>
        )}
      </div>
    </div>
  );
}
