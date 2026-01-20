import React from "react";

export default function Modal({ children, title, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title ? <div className="modal-header">{title}</div> : null}
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            الغاء
          </button>
        </div>
      </div>
    </div>
  );
}
