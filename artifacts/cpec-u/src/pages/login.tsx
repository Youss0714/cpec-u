import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [welcomeUser, setWelcomeUser] = useState<{ name: string; initial: string; subRole: string } | null>(null);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        const subRole = (data.user as any).adminSubRole;
        const redirect = () => {
          if ((data.user as any).mustChangePassword) {
            setLocation("/change-password");
            return;
          }
          if (data.user.role === "admin") {
            if ((data.user as any).adminSubRole === "hebergement") setLocation("/admin/housing");
            else setLocation("/admin");
          } else if (data.user.role === "teacher") setLocation("/teacher");
          else setLocation("/student");
        };

        if (subRole === "directeur") {
          setWelcomeUser({ name: data.user.name, initial: data.user.name.charAt(0), subRole: "directeur" });
          setTimeout(redirect, 3000);
        } else if (subRole === "scolarite" || subRole === "planificateur" || subRole === "hebergement") {
          setWelcomeUser({ name: data.user.name, initial: data.user.name.charAt(0), subRole });
          setTimeout(redirect, 2500);
        } else {
          toast({ title: "Connexion réussie", description: `Bienvenue ${data.user.name}` });
          redirect();
        }
      },
      onError: () => {
        toast({
          title: "Erreur de connexion",
          description: "Identifiants incorrects. Veuillez réessayer.",
          variant: "destructive",
        });
      },
    },
  });

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex flex-1 relative bg-sidebar overflow-hidden">
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.jpg`}
          alt="Étudiants CPEC-Digital" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/60 to-sidebar/20 z-20" />
        
        <motion.div
          className="absolute top-10 left-10 z-30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="Logo" className="w-20 h-20 object-contain rounded-2xl shadow-lg" />
        </motion.div>

        <div className="absolute bottom-16 left-16 z-30 max-w-xl text-sidebar-foreground">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="text-5xl font-serif font-bold leading-tight mb-4 text-white">
              L'Excellence Académique <br/> au Quotidien.
            </h1>
            <p className="text-lg text-sidebar-foreground/80">
              Système de gestion académique intégré pour l'administration, les enseignants et les étudiants.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="w-full max-w-md"
        >
          <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-xl">
            <CardHeader className="space-y-4 pb-8">
              <div className="lg:hidden flex justify-center mb-4">
                <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="Logo" className="w-20 h-20 object-contain rounded-xl shadow-md" />
              </div>
              <CardTitle className="text-3xl font-serif text-center">Connexion</CardTitle>
              <CardDescription className="text-center text-base">
                Accédez à votre espace sécurisé CPEC-Digital
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit((data) => loginMutation.mutate({ data }))} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground/80 font-semibold">Adresse Email</Label>
                  <Input 
                    id="email" 
                    placeholder="prenom.nom@cpec-u.edu" 
                    {...register("email")}
                    className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                  />
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground/80 font-semibold">Mot de passe</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    {...register("password")}
                    className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                  />
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Connexion en cours..." : "Se connecter"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      {/* Welcome overlay */}
      <AnimatePresence>
        {welcomeUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center gap-6 text-center px-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 18 }}
                className="w-24 h-24 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center text-primary text-4xl font-bold shadow-lg"
              >
                {welcomeUser.initial}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-2"
              >
                {welcomeUser.subRole === "directeur" ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                      Bienvenue
                    </p>
                    <p className="text-4xl font-serif font-bold text-foreground">
                      Monsieur le Directeur Général
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                      Connexion réussie
                    </p>
                    <p className="text-4xl font-serif font-bold text-foreground">
                      Je vous souhaite la bienvenue
                    </p>
                    <p className="text-lg text-muted-foreground mt-1 font-medium">
                      {welcomeUser.name}
                    </p>
                  </>
                )}
                <p className="text-muted-foreground text-sm mt-1">
                  Redirection vers votre tableau de bord…
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="w-56 h-1.5 rounded-full bg-muted overflow-hidden"
              >
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ animation: `farewell-progress ${welcomeUser.subRole === "directeur" ? "3" : "2.5"}s linear forwards` }}
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
