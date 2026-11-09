#include<string>
using namespace std;

class Expense{
    int Id;
    double Amount;
    string Category;
    string Date;
    string Description;
public:
    Expense(int Id, double Amount, string Category,string Date, string Description);
    int getId() const;
    double getAmount() const;
    string getCategory() const;
    string getDate() const;
    string getDescription() const;
};