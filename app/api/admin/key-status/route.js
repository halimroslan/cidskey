import { supabase } from '../../../../lib/supabase.js';

// GET /api/admin/key-status?key=CIDS-XXXX-XXXX-XXXX&adminSecret=xxx
// Lihat status sesebuah key - untuk admin
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const adminSecret = searchParams.get('adminSecret');

    const validSecret = process.env.LICENSE_API_SECRET || '@reeZ860';
    if (adminSecret !== validSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedKey = (key || '').trim().toUpperCase();

    // Dapatkan info key
    const { data: keyInfo } = await supabase
        .from('license_keys')
        .select('*')
        .eq('key', normalizedKey)
        .single();

    // Dapatkan device list
    const { data: devices } = await supabase
        .from('license_devices')
        .select('*')
        .eq('key', normalizedKey)
        .order('activated_at', { ascending: true });

    return Response.json({
        key: normalizedKey,
        info: keyInfo,
        devices: devices || [],
        deviceCount: devices ? devices.length : 0
    });
}

// POST /api/admin/key-status
// Actions: disable_key, enable_key, reset_devices
export async function POST(request) {
    const body = await request.json();
    const { action, key, machineId, adminSecret } = body;

    const validSecret = process.env.LICENSE_API_SECRET || '@reeZ860';
    if (adminSecret !== validSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedKey = (key || '').trim().toUpperCase();

    if (action === 'disable_key') {
        await supabase.from('license_keys').update({ is_active: false }).eq('key', normalizedKey);
        return Response.json({ success: true, message: `Key ${normalizedKey} telah dinyahaktifkan.` });
    }

    if (action === 'enable_key') {
        await supabase.from('license_keys').update({ is_active: true }).eq('key', normalizedKey);
        return Response.json({ success: true, message: `Key ${normalizedKey} telah diaktifkan semula.` });
    }

    if (action === 'reset_devices') {
        // Padam semua device untuk key ini
        await supabase.from('license_devices').delete().eq('key', normalizedKey);
        return Response.json({ success: true, message: `Semua device untuk ${normalizedKey} telah dipadamkan.` });
    }

    if (action === 'remove_device' && machineId) {
        await supabase.from('license_devices').delete().eq('key', normalizedKey).eq('machine_id', machineId);
        return Response.json({ success: true, message: `Device dideregistrasikan.` });
    }

    return Response.json({ error: 'Action tidak dikenali.' }, { status: 400 });
}
