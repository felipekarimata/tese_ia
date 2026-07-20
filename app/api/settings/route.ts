import { NextRequest, NextResponse } from 'next/server';
import { state } from '@/lib/state';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      settings: state.settings
    });
  } catch (error: any) {
    console.error('Settings get error:', error);
    return NextResponse.json(
      { error: `Failed to get settings: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { openaiKey, googleKey, xaiKey, anthropicKey, models } = body;

    // Update settings in memory
    if (openaiKey !== undefined) state.settings.openaiKey = openaiKey;
    if (googleKey !== undefined) state.settings.googleKey = googleKey;
    if (xaiKey !== undefined) state.settings.xaiKey = xaiKey;
    if (anthropicKey !== undefined) state.settings.anthropicKey = anthropicKey;
    if (models !== undefined) state.settings.models = models;

    return NextResponse.json({
      success: true,
      settings: state.settings
    });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: `Failed to update settings: ${error.message}` },
      { status: 500 }
    );
  }
}
