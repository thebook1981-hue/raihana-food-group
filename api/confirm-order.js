import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const telegramToken = process.env.TELEGRAM_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // 1. إعدادات الحماية والسماح بمرور الطلب من المتصفح
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // الرد السريع على طلبات الفحص المبدئي (CORS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { orderId } = req.body;

    if (!orderId) {
        return res.status(400).json({ error: 'رقم الطلب مفقود' });
    }

    try {
        // 2. جلب البيانات الأساسية للفاتورة
        const { data: order, error: orderError } = await supabase
            .from('platform_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) throw new Error('لم يتم العثور على الفاتورة');

        // 3. 🍔 جلب "تفاصيل الطعام" من جدول order_details
        const { data: items, error: itemsError } = await supabase
            .from('order_details')
            .select('item_name, quantity, price')
            .eq('order_id', orderId);

        // 4. جلب بيانات المطعم (للحصول على اسم المطعم ومعرف التليجرام الخاص به)
        const { data: restaurant, error: restError } = await supabase
            .from('restaurants')
            .select('name, telegram_chat_id')
            .eq('id', order.restaurant_id)
            .single();

        // 5. تحديث حالة الطلب فوراً إلى "قيد التجهيز"
        await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId);

        // 6. تجميع تفاصيل الطعام وترتيبها في قائمة نصية أنيقة
        let itemsText = '';
        if (items && items.length > 0) {
            itemsText = items.map(i => `▪️ ${i.item_name} (×${i.quantity}) - ${i.price * i.quantity} د.ع`).join('\n');
        } else {
            itemsText = 'لم يتم العثور على تفاصيل الأطباق';
        }

        // 7. تصميم "كارت الفاتورة" الذي سيصل في التليجرام
        const invoiceCode = '#9' + orderId.toString().padStart(5, '0');
        
        const message = `*🚨 طلب توصيل جديد (${invoiceCode}) 🚨*\n\n` +
                        `🏪 *المطعم:* ${restaurant ? restaurant.name : 'غير معروف'}\n` +
                        `📞 *هاتف الزبون:* ${order.customer_phone}\n` +
                        ` *منطقة الزبون:* ${order.address}\n` +
                        `📝 *الملاحظات:* ${order.customer_notes || 'لا يوجد'}\n\n` +
                        `🛒 *الأطباق المطلوبة:*\n${itemsText}\n\n` +
                        `🚚 *أجور التوصيل:* ${order.total_delivery_fee} د.ع\n` +
                        `💰 *الإجمالي المطلوب:* ${order.grand_total.toLocaleString()} د.ع\n\n` +
                        `⚠️ _تم تحديث حالة الطلب إلى (قيد التجهيز) تلقائياً._`;

        // 8. إرسال الرسالة إلى مدير المطعم عبر التليجرام
        const chatId = restaurant?.telegram_chat_id;
        
        if (chatId) {
            const tgUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
            await fetch(tgUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
        }

        // 9. إرسال رد النجاح للواجهة
        return res.status(200).json({ success: true, message: 'تم التجهيز والإرسال بنجاح' });
        
    } catch (err) {
        console.error("Server Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
