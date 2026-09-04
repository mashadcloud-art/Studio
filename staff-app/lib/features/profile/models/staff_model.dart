class StaffModel {
  final String id;
  final String name;
  final String phone;
  final String? address;
  final String joiningDate;
  final double salary;
  final String role;
  final bool active;
  final String? avatarUrl;
  final String createdAt;

  const StaffModel({
    required this.id,
    required this.name,
    required this.phone,
    this.address,
    required this.joiningDate,
    required this.salary,
    required this.role,
    required this.active,
    this.avatarUrl,
    required this.createdAt,
  });

  bool get isAdmin => role == 'admin';

  factory StaffModel.fromJson(Map<String, dynamic> json) {
    return StaffModel(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
      address: json['address'] as String?,
      joiningDate: json['joining_date'] as String,
      salary: (json['salary'] as num).toDouble(),
      role: json['role'] as String,
      active: json['active'] as bool,
      avatarUrl: json['avatar_url'] as String?,
      createdAt: json['created_at'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'address': address,
        'joining_date': joiningDate,
        'salary': salary,
        'role': role,
        'active': active,
        'avatar_url': avatarUrl,
        'created_at': createdAt,
      };
}
