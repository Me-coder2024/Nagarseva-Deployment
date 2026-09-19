import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useEmployees, useWards } from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Users, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

const Employees = () => {
  const { data: employees, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { data: wards } = useWards();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newEmployee, setNewEmployee] = useState<{
    name: string;
    email: string;
    role: "SURVEYOR" | "ENGINEER";
    password: string;
    wardId: string;
  }>({ name: "", email: "", role: "SURVEYOR", password: "", wardId: "" });

  const filteredEmployees =
    employees?.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === "all" || emp.role === filterRole;
      return matchesSearch && matchesRole;
    }) || [];

  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.email || !newEmployee.wardId) {
      toast.error(t('employees.fillAllFields'));
      return;
    }
    if (!newEmployee.password || newEmployee.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await addEmployee({
        name: newEmployee.name,
        email: newEmployee.email,
        role: newEmployee.role,
        password: newEmployee.password,
        wardId: newEmployee.wardId,
      });
      if (result && result.success) {
        toast.success(t('employees.employeeAdded'));
        setNewEmployee({ name: "", email: "", role: "SURVEYOR", password: "", wardId: "" });
        setIsDialogOpen(false);
      } else {
        toast.error(result?.message || "Failed to add employee.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add employee.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditEmployee = (employee: any) => {
    setEditingEmployee(employee);
    setNewEmployee({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      password: "",
      wardId: employee.wardId,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !newEmployee.name || !newEmployee.email || !newEmployee.wardId) {
      toast.error(t('employees.fillAllFields'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await updateEmployee(editingEmployee.id, {
        name: newEmployee.name,
        email: newEmployee.email,
        role: newEmployee.role,
        wardId: newEmployee.wardId,
      });
      if (result && result.success) {
        toast.success(t('employees.employeeUpdated'));
        setIsEditDialogOpen(false);
        setEditingEmployee(null);
        setNewEmployee({ name: "", email: "", role: "SURVEYOR", password: "", wardId: "" });
      } else {
        toast.error(result?.message || "Failed to update employee.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update employee.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (window.confirm("Are you sure you want to delete this employee?")) {
      setDeletingId(employeeId);
      try {
        const result = await deleteEmployee(employeeId);
        if (result && result.success) {
          toast.success(t('employees.employeeDeleted'));
        } else {
          toast.error(result?.message || "Failed to delete employee.");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to delete employee.");
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('employees.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('employees.subtitle')}
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {t('employees.addEmployee')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('employees.addNewEmployee')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('employees.fullName')}</Label>
                  <Input
                    id="name"
                    placeholder={t('employees.enterFullName')}
                    value={newEmployee.name}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('common.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="employee@nagarseva.gov.in"
                    value={newEmployee.email}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('common.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={newEmployee.password}
                    onChange={(e) =>
                      setNewEmployee({
                        ...newEmployee,
                        password: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">{t('employees.role')}</Label>
                  <Select
                    value={newEmployee.role}
                    onValueChange={(value: "SURVEYOR" | "ENGINEER") =>
                      setNewEmployee({ ...newEmployee, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('employees.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SURVEYOR">{t('employees.surveyor')}</SelectItem>
                      <SelectItem value="ENGINEER">{t('employees.engineer')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ward">Ward</Label>
                  <Select
                    value={newEmployee.wardId}
                    onValueChange={(value) =>
                      setNewEmployee({ ...newEmployee, wardId: value })
                    }
                  >
                    <SelectTrigger id="ward">
                      <SelectValue placeholder="Select ward" />
                    </SelectTrigger>
                    <SelectContent>
                      {wards?.map((ward) => (
                        <SelectItem key={ward.id} value={ward.id}>
                          {ward.name} ({ward.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddEmployee} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? "Adding..." : t('employees.addEmployee')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Employee Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Employee</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t('employees.fullName')}</Label>
                  <Input
                    id="edit-name"
                    placeholder={t('employees.enterFullName')}
                    value={newEmployee.name}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">{t('common.email')}</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    placeholder="employee@nagarseva.gov.in"
                    value={newEmployee.email}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">{t('employees.role')}</Label>
                  <Select
                    value={newEmployee.role}
                    onValueChange={(value: "SURVEYOR" | "ENGINEER") =>
                      setNewEmployee({ ...newEmployee, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('employees.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SURVEYOR">{t('employees.surveyor')}</SelectItem>
                      <SelectItem value="ENGINEER">{t('employees.engineer')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-ward">Ward</Label>
                  <Select
                    value={newEmployee.wardId}
                    onValueChange={(value) =>
                      setNewEmployee({ ...newEmployee, wardId: value })
                    }
                  >
                    <SelectTrigger id="edit-ward">
                      <SelectValue placeholder="Select ward" />
                    </SelectTrigger>
                    <SelectContent>
                      {wards?.map((ward) => (
                        <SelectItem key={ward.id} value={ward.id}>
                          {ward.name} ({ward.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleUpdateEmployee} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? "Updating..." : "Update Employee"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('employees.searchEmployees')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder={t('employees.filterByRole')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('employees.allRoles')}</SelectItem>
                  <SelectItem value="SURVEYOR">{t('employees.surveyors')}</SelectItem>
                  <SelectItem value="ENGINEER">{t('employees.engineers')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('employees.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('employees.role')}</TableHead>
                  <TableHead>{t('employees.created')}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.name}
                    </TableCell>
                    <TableCell>{employee.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          employee.role === "SURVEYOR" ? "default" : "secondary"
                        }
                      >
                        {employee.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{employee.createdAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingId === employee.id}
                          onClick={() => handleEditEmployee(employee)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingId === employee.id}
                          onClick={() => handleDeleteEmployee(employee.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredEmployees.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('employees.noEmployeesFound')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Employees;
