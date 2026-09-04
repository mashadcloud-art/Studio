class WorkRecordModel {
  final String id;
  final String staffId;
  final String customerId;
  final String serviceId;
  final DateTime startTime;
  final DateTime? endTime;
  final double amount;
  final String? notes;
  final String date;
  final String createdAt;

  // Joined fields
  final String customerName;
  final String customerPhone;
  final String serviceName;
  final double servicePrice;

  const WorkRecordModel({
    required this.id,
    required this.staffId,
    required this.customerId,
    required this.serviceId,
    required this.startTime,
    this.endTime,
    required this.amount,
    this.notes,
    required this.date,
    required this.createdAt,
    required this.customerName,
    required this.customerPhone,
    required this.serviceName,
    required this.servicePrice,
  });

  bool get isActive => endTime == null;

  Duration get duration {
    final end = endTime ?? DateTime.now();
    return end.difference(startTime);
  }

  String get durationText {
    final d = duration;
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h == 0) return '${m}m';
    return '${h}h ${m}m';
  }

  factory WorkRecordModel.fromJson(Map<String, dynamic> json) {
    final customers = json['customers'] as Map<String, dynamic>? ?? {};
    final services = json['services'] as Map<String, dynamic>? ?? {};
    return WorkRecordModel(
      id: json['id'] as String,
      staffId: json['staff_id'] as String,
      customerId: json['customer_id'] as String,
      serviceId: json['service_id'] as String,
      startTime: DateTime.parse(json['start_time'] as String),
      endTime: json['end_time'] != null ? DateTime.parse(json['end_time'] as String) : null,
      amount: (json['amount'] as num).toDouble(),
      notes: json['notes'] as String?,
      date: json['date'] as String,
      createdAt: json['created_at'] as String,
      customerName: customers['name'] as String? ?? '',
      customerPhone: customers['phone'] as String? ?? '',
      serviceName: services['name'] as String? ?? '',
      servicePrice: (services['price'] as num?)?.toDouble() ?? 0,
    );
  }
}
