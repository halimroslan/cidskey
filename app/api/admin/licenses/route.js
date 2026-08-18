import { supabase } from '../../../../lib/supabase.js';

function getAdminSecret(request) {
    const { searchParams } = new URL(request.url);
    const fromQuery = searchParams.get('adminSecret');
    const fromHeader = request.headers.get('x-admin-secret');
    return fromHeader || fromQuery || '';
}

function isAuthorized(request) {
    const providedSecret = getAdminSecret(request);
    const validSecret = process.env.LICENSE_API_SECRET || 'CIDS_LICENSE_SECRET_2026';
    return providedSecret === validSecret;
}

// GET /api/admin/licenses
// Mengambil senarai semua kunci lesen berserta rekod peranti berkaitan
export async function GET(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: 'Unauthorized: Kata laluan admin tidak sah.' }, { status: 401 });
    }

    try {
        // 1. Ambil semua kunci lesen
        const { data: keys, error: keysError } = await supabase
            .from('license_keys')
            .select('*')
            .order('created_at', { ascending: true });

        if (keysError) {
            return Response.json({ error: keysError.message }, { status: 500 });
        }

        // 2. Ambil semua rekod peranti
        const { data: devices, error: devError } = await supabase
            .from('license_devices')
            .select('*')
            .order('activated_at', { ascending: true });

        if (devError) {
            return Response.json({ error: devError.message }, { status: 500 });
        }

        // 3. Kelompokkan peranti mengikut key
        const devicesByKey = {};
        (devices || []).forEach(dev => {
            const k = (dev.key || '').trim().toUpperCase();
            if (!devicesByKey[k]) devicesByKey[k] = [];
            devicesByKey[k].push({
                id: dev.id,
                machineId: dev.machine_id,
                deviceName: dev.device_name || 'Tidak Dikenali',
                activatedAt: dev.activated_at,
                lastSeen: dev.last_seen
            });
        });

        // 4. Bina data komprehensif bagi setiap kunci
        let totalDevicesCount = 0;
        let activeKeysCount = 0;
        let disabledKeysCount = 0;

        const formattedKeys = (keys || []).map((item, index) => {
            const k = (item.key || '').trim().toUpperCase();
            const attachedDevices = devicesByKey[k] || [];
            const devCount = attachedDevices.length;
            totalDevicesCount += devCount;

            if (!item.is_active) {
                disabledKeysCount++;
            } else if (devCount > 0) {
                activeKeysCount++;
            }

            // Cari masa pertama dan terakhir diaktifkan
            let firstActivatedAt = null;
            let lastActivatedAt = null;

            if (devCount > 0) {
                const sortedDates = attachedDevices
                    .map(d => new Date(d.activatedAt).getTime())
                    .filter(t => !isNaN(t))
                    .sort((a, b) => a - b);

                if (sortedDates.length > 0) {
                    firstActivatedAt = new Date(sortedDates[0]).toISOString();
                    lastActivatedAt = new Date(sortedDates[sortedDates.length - 1]).toISOString();
                }
            }

            return {
                index: index + 1,
                id: item.id,
                key: k,
                maxDevices: item.max_devices || 2,
                deviceCount: devCount,
                isActive: item.is_active !== false,
                notes: item.notes || '',
                createdAt: item.created_at,
                firstActivatedAt,
                lastActivatedAt,
                devices: attachedDevices
            };
        });

        const stats = {
            totalKeys: formattedKeys.length,
            activeKeys: activeKeysCount,
            unusedKeys: formattedKeys.length - activeKeysCount - disabledKeysCount,
            disabledKeys: disabledKeysCount,
            totalDevices: totalDevicesCount,
            maxDevicesAllowed: 2
        };

        return Response.json({
            success: true,
            stats,
            licenses: formattedKeys
        });
    } catch (e) {
        return Response.json({ error: 'Ralat pelayan: ' + e.message }, { status: 500 });
    }
}

// POST /api/admin/licenses
// Tindakan pengurusan: reset peranti, buang peranti individu, aktifkan/nyahaktifkan, kemaskini nota
export async function POST(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: 'Unauthorized: Kata laluan admin tidak sah.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, key, deviceId, machineId, notes, isActive } = body;
        const normalizedKey = (key || '').trim().toUpperCase();

        if (!action) {
            return Response.json({ error: 'Action diperlukan.' }, { status: 400 });
        }

        // 1. Reset semua peranti bagi satu kunci
        if (action === 'reset_devices') {
            if (!normalizedKey) return Response.json({ error: 'Kunci lesen diperlukan.' }, { status: 400 });
            
            const { error } = await supabase
                .from('license_devices')
                .delete()
                .eq('key', normalizedKey);

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ success: true, message: `Semua slot peranti untuk ${normalizedKey} telah dikosongkan (reset).` });
        }

        // 2. Buang peranti tertentu sahaja
        if (action === 'remove_device') {
            let query = supabase.from('license_devices').delete();
            if (deviceId) {
                query = query.eq('id', deviceId);
            } else if (normalizedKey && machineId) {
                query = query.eq('key', normalizedKey).eq('machine_id', machineId);
            } else {
                return Response.json({ error: 'deviceId atau (key & machineId) diperlukan.' }, { status: 400 });
            }

            const { error } = await query;
            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ success: true, message: 'Peranti berjaya dibuang dari lesen.' });
        }

        // 3. Ubah status aktif / tidak aktif
        if (action === 'toggle_active') {
            if (!normalizedKey) return Response.json({ error: 'Kunci lesen diperlukan.' }, { status: 400 });
            const newStatus = isActive !== undefined ? isActive : false;

            const { error } = await supabase
                .from('license_keys')
                .update({ is_active: newStatus })
                .eq('key', normalizedKey);

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ 
                success: true, 
                message: `Lesen ${normalizedKey} kini ${newStatus ? 'DIAKTIFKAN' : 'DINYAHAKTIFKAN'}.` 
            });
        }

        // 4. Kemas kini nota (Nama guru, sekolah, rujukan belian)
        if (action === 'update_notes') {
            if (!normalizedKey) return Response.json({ error: 'Kunci lesen diperlukan.' }, { status: 400 });

            const { error } = await supabase
                .from('license_keys')
                .update({ notes: notes || null })
                .eq('key', normalizedKey);

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ success: true, message: `Nota bagi ${normalizedKey} berjaya dikemaskini.` });
        }

        return Response.json({ error: 'Action tidak dikenali.' }, { status: 400 });
    } catch (e) {
        return Response.json({ error: 'Ralat: ' + e.message }, { status: 500 });
    }
}
