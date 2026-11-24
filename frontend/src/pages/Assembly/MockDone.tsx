import { useState, useRef, useEffect } from 'react';
import { backendApi } from '../../config/instance';
import Swal from 'sweetalert2';
import type { SweetAlertIcon } from 'sweetalert2';
import type { MockDoneAddResult, MockDoneRemoveResult, MockDoneRequest, MockDoneRow } from '../../types/api';

const showAlert = (msg: string, type: SweetAlertIcon) => {
  void Swal.fire({
    position: 'center',
    icon: type,
    title: msg,
    showConfirmButton: false,
    timer: 1500,
  });
};

const MockDone = () => {
  const [lotNo, setLotNo] = useState('');
  const [list, setList] = useState<MockDoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchList();
    const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);
    refocus();
    document.addEventListener('click', refocus);
    return () => document.removeEventListener('click', refocus);
  }, []);

  const fetchList = async () => {
    try {
      const res = await backendApi.get<MockDoneRow[]>('/mock-done');
      setList(res.data);
    } catch (err) {
      console.error('fetchList failed', err);
    }
  };

  const handleAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const target = lotNo.trim();
    if (!target) return;

    setLoading(true);
    try {
      const res = await backendApi.post<MockDoneAddResult>('/mock-done', { lot_no: target } satisfies MockDoneRequest);
      if (res.data.result === 'OK') {
        showAlert('Added!', 'success');
        void fetchList();
      } else {
        showAlert(res.data.result, 'error');
      }
    } catch {
      showAlert('Error!', 'error');
    } finally {
      setLoading(false);
      setLotNo('');
    }
  };

  const handleDelete = async (lot_no: string) => {
    try {
      await backendApi.delete<MockDoneRemoveResult>(`/mock-done/${lot_no}`);
      void fetchList();
    } catch (err) {
      console.error('handleDelete failed', err);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Input lot no. ที่ done แล้ว</p>
        <input
          ref={inputRef}
          type="text"
          value={lotNo}
          onChange={(e) => setLotNo(e.target.value.toUpperCase())}
          onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
          onKeyDown={handleAdd}
          disabled={loading}
          placeholder="พิมพ์ lot no. แล้วกด Enter..."
          className="w-full h-10 px-3 text-base font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>

      <div className="flex-1 bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-500">Mock Done List ({list.length})</p>
        </div>
        <div className="overflow-y-auto flex-1">
          {list.length === 0 && (
            <p className="text-center py-12 text-gray-300 text-sm">No lots added yet</p>
          )}
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Lot No.', 'Created At', ''].map((col, i) => (
                  <th key={i} className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 border-b border-gray-100">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-3 font-mono text-sm text-gray-800">{item.lot_no}</td>
                  <td className="px-3 py-3 text-sm text-gray-400">{new Date(item.created_at).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => handleDelete(item.lot_no)}
                      className="text-sm text-gray-300 hover:text-red-500"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default MockDone;