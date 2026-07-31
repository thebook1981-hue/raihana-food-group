const { createClient } = require('@supabase/supabase-js');
const { Telegraf } = require('telegraf');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'رقم الطلب مفقود' });

    try {
        const { data: order, error: orderErr } = await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId)
            .select()
            .single();

        if (orderErr || !order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

        const { data: restaurant, error: restErr } = await supabase
            .from('restaurants')
            .select('name, telegram_chat_id')
            .eq('id', order.restaurant_id)
            .single();

        if (restaurant && restaurant.telegram_chat_id) {
            const adminMsg = `🚨 طلب مطعم جديد (${restaurant.name})!\n\n` +
                             `🧾 رقم الفاتورة: #9000${order.id}\n` +
                             `👤 الهاتف: ${order.customer_phone || 'غير متوفر'}\n` +
                             `💰 الإجمالي: ${order.grand_total} د.ع\n` +
                             `👨‍🍳 الحالة: قيد التجهيز\n\n` +
                             `يرجى إبلاغ المطبخ للبدء بالتجهيز.`;
            
            await bot.telegram.sendMessage(restaurant.telegram_chat_id, adminMsg);
        }

        return res.status(200).json({ success: true, order });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};
