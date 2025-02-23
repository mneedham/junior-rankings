import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'lta_players_data.csv');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return NextResponse.json({ data: fileContent });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read CSV' }, { status: 500 });
  }
}