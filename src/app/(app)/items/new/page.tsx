import Link from 'next/link';
import { ItemForm } from '../ItemForm';

export default function NewItemPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New item</h1>
          <p className="sub">
            Add to the catalogue. Stock arrives separately via{' '}
            <Link href="/receive" style={{ textDecoration: 'underline' }}>Receive</Link>.
          </p>
        </div>
      </div>
      <div style={{ maxWidth: 620 }}>
        <ItemForm />
      </div>
    </>
  );
}
