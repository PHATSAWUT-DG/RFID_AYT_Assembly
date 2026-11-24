import { useState, useRef, useEffect } from 'react';
import { backendApi } from '../../config/instance'
import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';
import type { As400Lot, RegisterTagRequest, RegisterTagResult } from '../../types/api';

interface RegisterRow extends As400Lot {
  tag_done: boolean;
}

const showAlert = (msg: string, type: SweetAlertIcon) => {
  void Swal.fire({
    position: 'center',
    icon: type,
    title: msg,
    showConfirmButton: false,
    timer: 1000,
  });
};

const Register = () => {
  const [lotNo, setLotNo] = useState('');
  const [lots, setLots] = useState<RegisterRow[]>([]);
  const [started, setStarted] = useState(false);
  const [activeLot, setActiveLot] = useState<string | null>(null);
  const [tagId, setTagId] = useState('');
  const [loading, setLoading] = useState(false);

  const lotRef = useRef<HTMLInputElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // focus lot input ถ้ายังไม่ start
  useEffect(() => {
    if (started) return;
    const refocus = () => setTimeout(() => lotRef.current?.focus(), 0);
    refocus();
    document.addEventListener('click', refocus);
    return () => document.removeEventListener('click', refocus);
  }, [started, loading]);

  // สแกน lot barcode กด Enter
  const handleLot = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const target = lotNo.trim();
    if (!target) return;

    if (lots.some(l => l.lot_no === target)) {
      showAlert('Lot already in list!', 'warning');
      setLotNo('');
      return;
    }

    setLoading(true);
    try {
      const res = await backendApi.get<As400Lot>(`/lot/${target}`);
      setLots(prev => [...prev, { ...res.data, tag_done: false }]);
      showAlert('Lot added!', 'success');
    } catch {
      showAlert('Lot not found!', 'error');
    } finally {
      setLoading(false);
      setLotNo('');
    }
  };

  // สแกน tag กด Enter
  const handleTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const tag = e.currentTarget.value.trim();
    if (!tag) return;
    setTagId(tag);
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setTagId(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const tag = val.trim();
      if (tag) void registerTag(tag, activeLot);
    }, 300);
  };

  const registerTag = async (tag: string, lotNo: string | null) => {
    try {
      // TODO(ts-bug-4): body lacks wos, brg_type, spec and qty, which RegisterTagRequest requires (RegisterSingle sends them). Cast keeps the old body.
      const body = { tag_id: tag, lot_no: lotNo } as RegisterTagRequest;
      const res = await backendApi.post<RegisterTagResult>('/register-tag', body);

      const result = res.data.result;
      if (result === 'OK') {
        setLots(prev => {
          const updated = prev.map(l =>
            l.lot_no === lotNo ? { ...l, tag_done: true } : l
          );
          const allDone = updated.every(l => l.tag_done);
          if (allDone) {
            showAlert('All lots complete!', 'success');
            setTimeout(() => cancelAll(), 1500);
          } else {
            showAlert(`${lotNo} complete!`, 'success');
            const next = updated.find(l => !l.tag_done);
            setActiveLot(next?.lot_no || null);
          }
          return updated;
        });
      } else if (result === 'TAG_IN_USE') {
        showAlert('Tag already in use!', 'error');
      } else if (result === 'LOT_ALREADY_EXISTS') {
        showAlert('Lot already registered!', 'warning');
      } else {
        showAlert(result, 'error');
      }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setTagId('');
    }
  };

  const startRegistering = () => {
    if (lots.length === 0) {
      showAlert('Add at least one lot first!', 'warning');
      return;
    }
    setStarted(true);
    setActiveLot(lots[0].lot_no);
    setTagId('');
    showAlert('Started! Scan tags now', 'success');
  };

  const cancelAll = () => {
    setLotNo('');
    setLots([]);
    setStarted(false);
    setActiveLot(null);
    setTagId('');
  };

  const removeLot = (lot_no: string) => {
    setLots(prev => prev.filter(l => l.lot_no !== lot_no));
    if (activeLot === lot_no) setActiveLot(null);
  };

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* SCAN BARCODE */}
      {!started && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-500 mb-2">Scan barcode to add lot</p>
          <input
            ref={lotRef}
            type="text"
            value={lotNo}
            onChange={(e) => setLotNo(e.target.value.toUpperCase())}
            onBlur={() => setTimeout(() => lotRef.current?.focus(), 0)}
            onKeyDown={handleLot}
            placeholder="Waiting for scanner..."
            disabled={loading}
            className="w-full h-10 px-3 text-base font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          />
        </div>
      )}

      {/* LOT LIST */}
      <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden min-h-0">

        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">Lots ({lots.length})</p>
          <div className="flex gap-2">
            {(lots.length > 0 || started) && (
              <button
                onClick={cancelAll}
                className="h-9 px-4 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
              >
                Cancel All
              </button>
            )}
            {!started ? (
              <button
                onClick={startRegistering}
                disabled={lots.length === 0}
                className="h-9 px-5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Start Registering →
              </button>
            ) : (
              <span className="text-sm px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                Scanning in progress
              </span>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {lots.length === 0 && (
            <p className="text-center py-12 text-gray-300 text-sm">No lots added yet</p>
          )}
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['', 'Lot No.', 'BRG Type', 'Spec', 'WOS', 'Qty', ''].map((col, i) => (
                  <th key={i} className="text-left px-3 py-2.5 text-sm font-medium text-gray-400 border-b border-gray-100 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lots.map(lot => {
                const isActive = activeLot === lot.lot_no;
                const isDone = lot.tag_done;
                return (
                  <tr
                    key={lot.lot_no}
                    onClick={() => started && !isDone && setActiveLot(lot.lot_no)}
                    className={`border-b border-gray-50 transition-colors
                                            ${started && !isDone ? 'cursor-pointer' : ''}
                                            ${isActive ? 'bg-blue-50' : isDone ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-3 py-3.5">
                      <span className={`block w-2.5 h-2.5 rounded-full ${isActive ? 'bg-blue-600' : isDone ? 'bg-green-500' : 'bg-gray-200'}`} />
                    </td>
                    <td className="px-3 py-3.5 font-mono text-sm font-medium text-blue-600">{lot.lot_no}</td>
                    <td className="px-3 py-3.5 text-sm text-gray-600">{lot.brg_type || '—'}</td>
                    <td className="px-3 py-3.5 text-sm text-gray-600">{lot.spec || '—'}</td>
                    <td className="px-3 py-3.5 text-sm text-gray-500">{lot.wos || '—'}</td>
                    <td className="px-3 py-3.5 text-sm text-gray-500">{lot.qty?.toLocaleString() || '—'}</td>
                    <td className="px-3 py-3.5">
                      {isActive && started && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">ACTIVE</span>
                      )}
                      {isDone && (
                        <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">DONE</span>
                      )}
                      {!started && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeLot(lot.lot_no); }}
                          className="text-sm text-gray-300 hover:text-red-500"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SCAN TAG */}
      {started && (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-400 mb-1">
            Scanning into: <span className="font-mono text-blue-600 font-medium">{activeLot || '—'}</span>
          </p>
          <input
            ref={tagRef}
            type="text"
            value={tagId}
            onChange={handleTagChange}
            onBlur={() => setTimeout(() => tagRef.current?.focus(), 0)}
            disabled={loading}
            placeholder="Waiting for tag..."
            className="w-full h-10 px-3 text-base font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          />
        </div>
      )}

    </div>
  );
};

export default Register;