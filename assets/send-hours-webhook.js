// ════════════════════════════════════════════════════════════════
// AUTOMATIC HOURS REPORT - SENDS TO DISCORD EVERY 24 HOURS
// ════════════════════════════════════════════════════════════════

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1570955929346904134/VZX4lT9YRoyPGb_PyE2CIMJtUT3Sa1ElYux8O2Devet_IIFcA7B7ZxfEEF2-SayWZ0E8';

async function sendHoursReportWebhook() {
  try {
    // Get current hours from Supabase
    const shifts = await supaSelect(
      'police_shift_sessions',
      'discord_id, username, total_seconds, status',
      { status: 'eq.completed' }
    );

    if (!shifts || shifts.length === 0) {
      console.log('⚠️ No shifts found');
      return;
    }

    // Calculate totals per officer
    const officerHours = {};
    shifts.forEach(shift => {
      if (!officerHours[shift.discord_id]) {
        officerHours[shift.discord_id] = {
          username: shift.username,
          totalSeconds: 0,
          shifts: 0
        };
      }
      officerHours[shift.discord_id].totalSeconds += (shift.total_seconds || 0);
      officerHours[shift.discord_id].shifts += 1;
    });

    // Convert to array and sort
    const sortedOfficers = Object.entries(officerHours)
      .map(([discordId, data]) => ({
        discordId,
        username: data.username,
        totalSeconds: data.totalSeconds,
        totalHours: (data.totalSeconds / 3600).toFixed(2),
        shifts: data.shifts
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    // Build Discord embed
    const totalHours = sortedOfficers.reduce((sum, o) => sum + parseFloat(o.totalHours), 0);
    const totalOfficers = sortedOfficers.length;

    const fields = sortedOfficers.slice(0, 25).map(officer => ({
      name: `${officer.username || 'Unknown'}`,
      value: `**${officer.totalHours}h** (${officer.shifts} turnos)`,
      inline: true
    }));

    const embed = {
      title: '📊 REPORTE DE HORAS - HOUSTON RP',
      description: `Actualización automática: ${new Date().toLocaleString('es-ES')}`,
      color: 0x4acf8f,
      fields: [
        {
          name: '📈 ESTADÍSTICAS TOTALES',
          value: `**Total de Horas:** ${totalHours.toFixed(2)}h\n**Oficiales:** ${totalOfficers}\n**Turnos Totales:** ${shifts.length}`,
          inline: false
        },
        ...fields
      ],
      footer: {
        text: 'HOUSTON RP - Sistema Automático de Horas',
        icon_url: 'https://discord.com/api/v10/users/1502940172348690482/avatars/default'
      },
      timestamp: new Date().toISOString()
    };

    // Send to Discord webhook
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'Houston Hub - Horas',
        avatar_url: 'https://cdn.discordapp.com/avatars/1502940172348690482/default',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log('✅ Hours report sent to Discord webhook');
      return true;
    } else {
      console.error('❌ Failed to send webhook:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending hours webhook:', error);
    return false;
  }
}

// Schedule to run every 24 hours
function scheduleHoursReport() {
  // Send immediately on load
  sendHoursReportWebhook();

  // Then every 24 hours (86400000 ms)
  setInterval(() => {
    sendHoursReportWebhook();
  }, 86400000);

  console.log('⏰ Hours report scheduled - sends every 24 hours');
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendHoursReportWebhook, scheduleHoursReport };
}
